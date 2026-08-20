import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { brickCategories, brickLoadingEntries, dispatches, people, ledgerEntries, BRICK_VEHICLE_TYPES } from "../db/schema";
import { addLedgerEntry } from "./ledger.service";
import { deleteDispatch, isDuplicateEntryError, MAX_NUMBER_GENERATION_ATTEMPTS } from "./dispatch.service";
import { emitToKiln } from "../config/socket";

export type BrickVehicleType = (typeof BRICK_VEHICLE_TYPES)[number];

export interface CreateBrickLoadingInput {
  kilnId: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  driverName?: string;
  driverPhone?: string;
  tipAmount?: number;
  vehicleType: BrickVehicleType;
  vehicleNumber: string;
  bricksCount: number;
  unloadedBricksCount?: number;
  loadingLaborerCount?: number;
  loadingRatePerThousand?: number;
  unloadingLaborerCount?: number;
  unloadingRatePerThousand?: number;
  categoryId: string;
  // Admin-entered per trip -- never defaulted from the category's own
  // pricePerBrick, since the price varies customer to customer.
  pricePerBrick: number;
  date?: Date;
  unloadingDate?: Date;
}

// Total Loading/Unloading Charge = (bricks/1000) x rate per 1,000 bricks --
// same "/1000" convention as every other ratePerThousand computation in
// this app (molding wages, work entries, etc.). Laborer count is no longer
// part of this formula (removed from the Log Trip form) -- a rate left
// blank simply leaves the charge unset rather than computing a false ₹0.
function computeLaborCharge(bricks: number | undefined, ratePerThousand: number | undefined) {
  if (!bricks || !ratePerThousand) return undefined;
  return Math.round((bricks / 1000) * ratePerThousand * 100) / 100;
}

// Plain, sequential per-kiln trip counter — same never-resets convention as
// dispatch.service.ts's generateInvoiceNumber. Under MySQL this
// count-then-insert can race between two concurrent creates for the same
// kiln, same as slip/invoice numbers — closed by the retry loop in
// createBrickLoadingEntry below, not by trying to make this atomic.
async function generateTripNumber(kilnId: string) {
  const countRow = (await db.select({ count: sql<number>`count(*)` }).from(brickLoadingEntries).where(eq(brickLoadingEntries.kilnId, kilnId)))[0];
  return String((countRow?.count ?? 0) + 1);
}

// The vehicle-loading operation record — which truck/tractor, how many
// bricks, which category — kept separate from Dispatch (the sale) and
// LoadingEntry (the palledar's wage for the physical loading labor). Every
// trip gets a unique sequential trip number and an auto-computed final
// amount: (category price × bricksCount − discount) + loadingCharge +
// unloadingCharge. Does NOT create a Dispatch — that link is established
// the other way round, from the Dispatch page's "Linked Loading Trip"
// picker (see createDispatch's loadingEntryId handling in
// dispatch.service.ts), which is also what sets this row's dispatchId.
export async function createBrickLoadingEntry(input: CreateBrickLoadingInput) {
  const category = (await db.select().from(brickCategories).where(and(eq(brickCategories._id, input.categoryId), eq(brickCategories.kilnId, input.kilnId))))[0];
  if (!category) throw new Error("Brick category not found in this kiln");

  // Total Amount = Loaded Brick Count x THIS TRIP's admin-entered price —
  // never the category's own default pricePerBrick; loading/unloading
  // charges are tracked as entirely separate figures below, never folded
  // into this one.
  const finalAmount = Math.round(input.bricksCount * input.pricePerBrick * 100) / 100;
  const loadingCharge = computeLaborCharge(input.bricksCount, input.loadingRatePerThousand);
  const unloadingCharge = computeLaborCharge(input.unloadedBricksCount, input.unloadingRatePerThousand);

  // Retry loop: two concurrent creates for the same kiln can both compute
  // the same trip number (the count-then-insert above isn't atomic under
  // MySQL) — the (kilnId, tripNumber) unique constraint is the real
  // guarantee; a collision surfaces as a duplicate-entry error, caught
  // here, and the number is simply recomputed and retried.
  let entry: typeof brickLoadingEntries.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const tripNumber = await generateTripNumber(input.kilnId);
    const _id = randomUUID();
    try {
      await db.insert(brickLoadingEntries).values({
        _id,
        kilnId: input.kilnId,
        tripNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        tipAmount: input.tipAmount,
        vehicleType: input.vehicleType,
        vehicleNumber: input.vehicleNumber,
        bricksCount: input.bricksCount,
        unloadedBricksCount: input.unloadedBricksCount,
        loadingLaborerCount: input.loadingLaborerCount,
        loadingRatePerThousand: input.loadingRatePerThousand,
        unloadingLaborerCount: input.unloadingLaborerCount,
        unloadingRatePerThousand: input.unloadingRatePerThousand,
        categoryId: input.categoryId,
        pricePerBrick: input.pricePerBrick,
        loadingCharge,
        unloadingCharge,
        amount: finalAmount,
        date: input.date,
        unloadingDate: input.unloadingDate,
      });
      entry = (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, _id)))[0];
      break;
    } catch (err) {
      lastError = err;
      if (!isDuplicateEntryError(err)) throw err;
    }
  }
  if (!entry) {
    throw lastError instanceof Error ? lastError : new Error("Failed to create loading entry: could not allocate a unique trip number");
  }

  // The bricks physically left the yard on this trip — deduct from that
  // category's stock the same way the Stock page's manual "loading out"
  // flow does (createStockLoadingEntry), just without a separate
  // stockLoadingEntries row, since this brickLoadingEntries row is already
  // the audit trail for the same physical movement.
  await db.update(brickCategories)
    .set({ quantity: sql`${brickCategories.quantity} - ${input.bricksCount}` })
    .where(eq(brickCategories._id, input.categoryId));
  emitToKiln(input.kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, input.categoryId)))[0]);

  emitToKiln(input.kilnId, "brickLoading:update", entry);
  return entry;
}

export interface UpdateBrickLoadingInput {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: BrickVehicleType;
  vehicleNumber?: string;
  bricksCount?: number;
  unloadedBricksCount?: number;
  loadingLaborerCount?: number;
  loadingRatePerThousand?: number;
  unloadingLaborerCount?: number;
  unloadingRatePerThousand?: number;
  // Admin-entered per trip — never defaulted from the category's own
  // pricePerBrick.
  pricePerBrick?: number;
  notes?: string;
  date?: Date;
  unloadingDate?: Date;
  // Legacy — only meaningful for entries created before Driver/Tip were
  // removed from the Log Trip form, i.e. rows that already have a
  // driverId. See the driverId guard below.
  tipAmount?: number;
}

// Full admin edit — never silently rewrites a tip already posted to the
// driver's ledger; a changed tipAmount posts a correction entry for the
// difference instead (DUE if raised, PAID if lowered), same convention as
// every other correctable amount in this app (see stacking.service.ts's
// original wage-delta pattern). A changed bricksCount/pricePerBrick
// recomputes the stored `amount` — changing the category itself isn't
// supported here (that would also need to move stock between categories).
// A changed bricksCount/unloadedBricksCount/laborer count/rate recomputes
// loadingCharge/unloadingCharge the same way createBrickLoadingEntry does.
export async function updateBrickLoadingEntry(kilnId: string, entryId: string, input: UpdateBrickLoadingInput) {
  const existing = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries._id, entryId), eq(brickLoadingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Brick loading entry not found in this kiln");

  const oldTip = existing.tipAmount ?? 0;

  let amountUpdate: { amount?: number } = {};
  if (input.bricksCount !== undefined || input.pricePerBrick !== undefined) {
    const bricksCount = input.bricksCount ?? existing.bricksCount;
    const pricePerBrick = input.pricePerBrick ?? existing.pricePerBrick ?? 0;
    amountUpdate = { amount: Math.round(bricksCount * pricePerBrick * 100) / 100 };
  }

  let chargeUpdate: { loadingCharge?: number; unloadingCharge?: number } = {};
  if (input.bricksCount !== undefined || input.loadingRatePerThousand !== undefined) {
    chargeUpdate.loadingCharge = computeLaborCharge(
      input.bricksCount ?? existing.bricksCount,
      input.loadingRatePerThousand ?? existing.loadingRatePerThousand ?? undefined
    );
  }
  if (input.unloadedBricksCount !== undefined || input.unloadingRatePerThousand !== undefined) {
    chargeUpdate.unloadingCharge = computeLaborCharge(
      input.unloadedBricksCount ?? existing.unloadedBricksCount ?? undefined,
      input.unloadingRatePerThousand ?? existing.unloadingRatePerThousand ?? undefined
    );
  }

  await db.update(brickLoadingEntries).set({ ...input, ...amountUpdate, ...chargeUpdate }).where(eq(brickLoadingEntries._id, entryId));
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

  if (input.tipAmount !== undefined && updated.driverId) {
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

  if (existing.tipAmount && existing.tipAmount > 0 && existing.driverId) {
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

  // Most recent first: `date` is the primary business ordering, but two
  // trips logged the same day sort by actual entry order (createdAt) as a
  // tiebreak, so "most recent" always means the trip just added shows on
  // top instead of an arbitrary same-day order.
  const rows = await db
    .select()
    .from(brickLoadingEntries)
    .where(and(...conditions))
    .orderBy(desc(brickLoadingEntries.date), desc(brickLoadingEntries.createdAt));
  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((v): v is string => !!v))];
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
    driverId: r.driverId ? driverById.get(r.driverId) ?? r.driverId : undefined,
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
    if (!e.driverId) continue;
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
