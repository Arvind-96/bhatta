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
  vehicleType: BrickVehicleType;
  vehicleNumber: string;
  bricksCount: number;
  categoryId: string;
  loadingCharge?: number;
  unloadingCharge?: number;
  discountAmount?: number;
  date?: Date;
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

  const grossAmount = Math.round(input.bricksCount * (category.pricePerBrick ?? 0) * 100) / 100;
  const netAfterDiscount = input.discountAmount ? Math.round((grossAmount - input.discountAmount) * 100) / 100 : grossAmount;
  // Clamped at 0 — a trip's billed amount can't be meaningfully negative
  // even if a large discount outweighs the category price and charges.
  const finalAmount = Math.max(0, Math.round((netAfterDiscount + (input.loadingCharge ?? 0) + (input.unloadingCharge ?? 0)) * 100) / 100);

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
        vehicleType: input.vehicleType,
        vehicleNumber: input.vehicleNumber,
        bricksCount: input.bricksCount,
        categoryId: input.categoryId,
        loadingCharge: input.loadingCharge,
        unloadingCharge: input.unloadingCharge,
        discountAmount: input.discountAmount,
        amount: finalAmount,
        date: input.date,
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
  vehicleType?: BrickVehicleType;
  vehicleNumber?: string;
  bricksCount?: number;
  discountAmount?: number;
  loadingCharge?: number;
  unloadingCharge?: number;
  notes?: string;
  // Legacy — only meaningful for entries created before Driver/Tip were
  // removed from the Log Trip form, i.e. rows that already have a
  // driverId. See the driverId guard below.
  tipAmount?: number;
}

// Full admin edit — never silently rewrites a tip already posted to the
// driver's ledger; a changed tipAmount posts a correction entry for the
// difference instead (DUE if raised, PAID if lowered), same convention as
// every other correctable amount in this app (see stacking.service.ts's
// original wage-delta pattern). A changed bricksCount/discountAmount/
// loadingCharge/unloadingCharge recomputes the stored `amount` against the
// entry's existing category price — changing the category itself isn't
// supported here (that would also need to move stock between categories),
// so `amount` stays untouched if the entry never had one priced.
export async function updateBrickLoadingEntry(kilnId: string, entryId: string, input: UpdateBrickLoadingInput) {
  const existing = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries._id, entryId), eq(brickLoadingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Brick loading entry not found in this kiln");

  const oldTip = existing.tipAmount ?? 0;

  let amountUpdate: { amount?: number } = {};
  if (
    existing.categoryId &&
    (input.bricksCount !== undefined || input.discountAmount !== undefined || input.loadingCharge !== undefined || input.unloadingCharge !== undefined)
  ) {
    const category = (await db.select().from(brickCategories).where(eq(brickCategories._id, existing.categoryId)))[0];
    const bricksCount = input.bricksCount ?? existing.bricksCount;
    const discountAmount = input.discountAmount ?? existing.discountAmount ?? 0;
    const loadingCharge = input.loadingCharge ?? existing.loadingCharge ?? 0;
    const unloadingCharge = input.unloadingCharge ?? existing.unloadingCharge ?? 0;
    const grossAmount = Math.round(bricksCount * (category?.pricePerBrick ?? 0) * 100) / 100;
    const netAfterDiscount = discountAmount ? Math.round((grossAmount - discountAmount) * 100) / 100 : grossAmount;
    amountUpdate = { amount: Math.max(0, Math.round((netAfterDiscount + loadingCharge + unloadingCharge) * 100) / 100) };
  }

  await db.update(brickLoadingEntries).set({ ...input, ...amountUpdate }).where(eq(brickLoadingEntries._id, entryId));
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

  const rows = await db.select().from(brickLoadingEntries).where(and(...conditions)).orderBy(desc(brickLoadingEntries.date));
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
