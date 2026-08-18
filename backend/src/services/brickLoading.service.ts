import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { brickCategories, brickLoadingEntries, dispatches, people, ledgerEntries, BRICK_VEHICLE_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { createDispatch, deleteDispatch } from "./dispatch.service";
import { emitToKiln } from "../config/socket";

export type BrickVehicleType = (typeof BRICK_VEHICLE_TYPES)[number];

export interface CreateBrickLoadingInput {
  kilnId: string;
  vehicleType: BrickVehicleType;
  vehicleNumber: string;
  driverId: string;
  bricksCount: number;
  tipAmount?: number;
  loadingCharge?: number;
  categoryId?: string;
  // Applied against the auto-computed gross (bricksCount * pricePerBrick)
  // before the auto-created Dispatch is saved — see createDispatch's own
  // netting logic, which this just triggers.
  discountAmount?: number;
  dispatchId?: string;
  date?: Date;
  notes?: string;
}

// The vehicle-loading operation record — which truck/tractor, which
// driver, how many bricks — kept separate from Dispatch (the sale) and
// LoadingEntry (the palledar's wage for the physical loading labor). A
// tip/inaam given to the driver posts straight to their ledger, same
// DUE-entry pattern used for every other bonus in this app (see
// firingShift.service.ts's OT/bonus).
export async function createBrickLoadingEntry(input: CreateBrickLoadingInput) {
  await assertPersonOfType(input.kilnId, input.driverId, ["DRIVER"]);
  if (input.dispatchId) {
    const dispatch = (await db.select({ _id: dispatches._id }).from(dispatches).where(and(eq(dispatches._id, input.dispatchId), eq(dispatches.kilnId, input.kilnId))))[0];
    if (!dispatch) throw new Error("Referenced dispatch not found in this kiln");
  }

  // discountAmount only ever feeds the auto-created Dispatch below — it's
  // not a column on brickLoadingEntries, so it's kept out of the insert.
  const { discountAmount, ...entryInput } = input;

  const _id = randomUUID();
  await db.insert(brickLoadingEntries).values({ ...entryInput, _id });
  let entry = (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, _id)))[0]!;

  if (input.tipAmount && input.tipAmount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.driverId,
      direction: "DUE",
      amount: input.tipAmount,
      reason: `Driver tip/inaam — ${input.vehicleNumber} (${input.bricksCount.toLocaleString()} bricks)`,
      date: input.date,
      category: "TIP",
    });
  }

  if (input.categoryId) {
    const category = (await db.select().from(brickCategories).where(and(eq(brickCategories._id, input.categoryId), eq(brickCategories.kilnId, input.kilnId))))[0];

    if (category) {
      // The bricks physically left the yard on this trip — deduct from
      // that category's stock the same way the Stock page's manual
      // "loading out" flow does (createStockLoadingEntry), just without a
      // separate stockLoadingEntries row, since this brickLoadingEntries
      // row is already the audit trail for the same physical movement.
      await db.update(brickCategories)
        .set({ quantity: sql`${brickCategories.quantity} - ${input.bricksCount}` })
        .where(eq(brickCategories._id, input.categoryId));
      emitToKiln(input.kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, input.categoryId)))[0]);

      // Auto-create a matching Dispatch so this trip shows up on the
      // Dispatch page without a manual step — only when the admin hasn't
      // already linked an existing dispatch and this category has a real
      // price set (dispatches require a positive amount, so an unpriced
      // category can't produce a valid one yet). Never lets a dispatch
      // failure undo the already-saved loading entry or the stock
      // deduction above — worst case is just no auto-linked dispatch, not
      // a lost trip.
      const grossAmount = Math.round(input.bricksCount * (category.pricePerBrick ?? 0) * 100) / 100;
      const netAmount = discountAmount ? Math.round((grossAmount - discountAmount) * 100) / 100 : grossAmount;

      if (!input.dispatchId && category.pricePerBrick && category.pricePerBrick > 0 && netAmount > 0) {
        try {
          const dispatch = await createDispatch({
            kilnId: input.kilnId,
            customerName: `Brick Loading — ${input.vehicleNumber}, ${(input.date ?? new Date()).toLocaleDateString("en-IN")}`,
            bricksCount: input.bricksCount,
            amount: grossAmount,
            discountAmount,
            driverId: input.driverId,
            categoryId: input.categoryId,
            vehicleNumber: input.vehicleNumber,
            vehicleType: input.vehicleType,
            driverTipAmount: input.tipAmount,
            dispatchedOn: input.date,
          });
          await db.update(brickLoadingEntries).set({ dispatchId: dispatch._id }).where(eq(brickLoadingEntries._id, _id));
          entry = (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, _id)))[0]!;
        } catch (err) {
          console.error("[brickLoading] auto-dispatch creation failed, loading entry still saved:", err);
          // Not persisted — just this one response — so the admin can see
          // "trip saved, billing didn't auto-link" immediately instead of
          // only finding out from a server log. The trip itself is still
          // saved either way; this never blocks/undoes it.
          return { ...entry, dispatchSyncFailed: true };
        }
      }
    }
  }

  emitToKiln(input.kilnId, "brickLoading:update", entry);
  return entry;
}

export interface UpdateBrickLoadingInput {
  vehicleType?: BrickVehicleType;
  vehicleNumber?: string;
  bricksCount?: number;
  tipAmount?: number;
  loadingCharge?: number;
  notes?: string;
}

// Full admin edit — never silently rewrites a tip already posted to the
// driver's ledger; a changed tipAmount posts a correction entry for the
// difference instead (DUE if raised, PAID if lowered), same convention as
// every other correctable amount in this app (see stacking.service.ts's
// original wage-delta pattern).
export async function updateBrickLoadingEntry(kilnId: string, entryId: string, input: UpdateBrickLoadingInput) {
  const existing = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries._id, entryId), eq(brickLoadingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Brick loading entry not found in this kiln");

  const oldTip = existing.tipAmount ?? 0;

  await db.update(brickLoadingEntries).set(input).where(eq(brickLoadingEntries._id, entryId));
  const updated = (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, entryId)))[0]!;

  // A changed bricksCount means the original stock deduction (see
  // createBrickLoadingEntry) is now off by the difference — correct the
  // category's quantity by exactly that delta rather than re-deducting the
  // new total, which would double-count the portion already applied.
  if (input.bricksCount !== undefined && existing.categoryId) {
    const delta = input.bricksCount - existing.bricksCount;
    if (delta !== 0) {
      await db.update(brickCategories)
        .set({ quantity: sql`${brickCategories.quantity} - ${delta}` })
        .where(eq(brickCategories._id, existing.categoryId));
      emitToKiln(kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, existing.categoryId)))[0]);
    }
  }

  if (input.tipAmount !== undefined) {
    const delta = Math.round((input.tipAmount - oldTip) * 100) / 100;
    if (delta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.driverId,
        direction: "DUE",
        amount: delta,
        reason: `Driver tip correction — revised up to ₹${input.tipAmount} for ${updated.vehicleNumber}`,
        category: "TIP",
      });
    } else if (delta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.driverId,
        direction: "PAID",
        amount: -delta,
        reason: `Driver tip correction — revised down to ₹${input.tipAmount} for ${updated.vehicleNumber}`,
        category: "TIP",
      });
    }
  }

  emitToKiln(kilnId, "brickLoading:update", updated);
  return updated;
}

// Reverses everything createBrickLoadingEntry could have caused: the
// driver-tip ledger DUE (reversed via a PAID correction, current
// `tipAmount` value — same "reverse what's outstanding now" convention as
// deleteDispatch), and the brickCategories.quantity deduction. That
// deduction is restored in one of two ways depending on whether this trip
// auto-linked a Dispatch:
//   - linked (dispatchId set): deleteDispatch already restores
//     brickCategories using the DISPATCH's own current
//     categoryId/bricksCount (the authoritative "what's actually deducted"
//     state, even if either side was independently edited since creation)
//     and un-links + deletes the dispatch itself — this function must NOT
//     also restore the category here, or the quantity would be double-credited.
//   - unlinked (no dispatchId, e.g. the category had no price set): nothing
//     else will restore it, so this function does it directly.
export async function deleteBrickLoadingEntry(kilnId: string, entryId: string) {
  const existing = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries._id, entryId), eq(brickLoadingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Brick loading entry not found in this kiln");

  if (existing.tipAmount && existing.tipAmount > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.driverId,
      direction: "PAID",
      amount: existing.tipAmount,
      reason: `Loading trip deleted — reversing driver tip for ${existing.vehicleNumber}`,
      category: "TIP",
    });
  }

  if (existing.dispatchId) {
    await deleteDispatch(kilnId, existing.dispatchId);
  } else if (existing.categoryId) {
    await db.update(brickCategories)
      .set({ quantity: sql`${brickCategories.quantity} + ${existing.bricksCount}` })
      .where(eq(brickCategories._id, existing.categoryId));
    emitToKiln(kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, existing.categoryId)))[0]);
  }

  await db.delete(brickLoadingEntries).where(eq(brickLoadingEntries._id, entryId));
  emitToKiln(kilnId, "brickLoading:update", { _id: entryId, deleted: true });
}

export interface ListBrickLoadingFilter {
  driverId?: string;
  days?: number;
}

export async function listBrickLoadingEntries(kilnId: string, filter: ListBrickLoadingFilter = {}) {
  const conditions = [eq(brickLoadingEntries.kilnId, kilnId)];
  if (filter.driverId) conditions.push(eq(brickLoadingEntries.driverId, filter.driverId));
  if (filter.days) {
    const since = new Date();
    since.setDate(since.getDate() - filter.days);
    conditions.push(gte(brickLoadingEntries.date, since));
  }

  const rows = await db.select().from(brickLoadingEntries).where(and(...conditions)).orderBy(desc(brickLoadingEntries.date));
  const driverIds = [...new Set(rows.map((r) => r.driverId))];
  const dispatchIds = [...new Set(rows.map((r) => r.dispatchId).filter((v): v is string => !!v))];
  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))];
  const [driverRows, dispatchRows, categoryRows] = await Promise.all([
    driverIds.length ? db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, driverIds)) : [],
    dispatchIds.length ? db.select({ _id: dispatches._id, slipNumber: dispatches.slipNumber, customerName: dispatches.customerName }).from(dispatches).where(inArray(dispatches._id, dispatchIds)) : [],
    categoryIds.length ? db.select({ _id: brickCategories._id, category: brickCategories.category }).from(brickCategories).where(inArray(brickCategories._id, categoryIds)) : [],
  ]);
  const driverById = new Map(driverRows.map((d) => [d._id, d]));
  const dispatchById = new Map(dispatchRows.map((d) => [d._id, d]));
  const categoryById = new Map(categoryRows.map((c) => [c._id, c]));
  return rows.map((r) => ({
    ...r,
    driverId: driverById.get(r.driverId) ?? r.driverId,
    dispatchId: r.dispatchId ? dispatchById.get(r.dispatchId) ?? r.dispatchId : r.dispatchId,
    categoryId: r.categoryId ? categoryById.get(r.categoryId) ?? r.categoryId : r.categoryId,
  }));
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// Per-driver rollup: every driver who's ever loaded a brick delivery, their
// total bricks moved, total tips earned, trip count, and ledger balance —
// so an owner can see "who's driving the most, and what have I tipped them"
// at a glance.
export async function brickLoadingDriverSummary(kilnId: string) {
  const drivers = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "DRIVER"), eq(people.active, true))).orderBy(asc(people.name));

  const allEntries = await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries.kilnId, kilnId));
  const entriesByDriver = new Map<string, typeof allEntries>();
  for (const e of allEntries) {
    const id = e.driverId;
    if (!entriesByDriver.has(id)) entriesByDriver.set(id, []);
    entriesByDriver.get(id)!.push(e);
  }

  const results = [];
  for (const driver of drivers) {
    const driverEntries = entriesByDriver.get(driver._id) ?? [];
    if (driverEntries.length === 0) continue;

    const driverLedgerEntries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, driver._id)));
    const { due, paid, balance } = sumByDirection(driverLedgerEntries);

    results.push({
      driver: {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicleNumber: driver.vehicleNumber ?? null,
      },
      totalBricksLoaded: driverEntries.reduce((sum, e) => sum + e.bricksCount, 0),
      totalTips: driverEntries.reduce((sum, e) => sum + (e.tipAmount ?? 0), 0),
      tripCount: driverEntries.length,
      totalDue: due,
      totalPaid: paid,
      balance,
    });
  }

  return {
    drivers: results,
    totalBricksLoadedAllDrivers: results.reduce((sum, r) => sum + r.totalBricksLoaded, 0),
  };
}
