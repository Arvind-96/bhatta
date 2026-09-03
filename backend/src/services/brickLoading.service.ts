import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { brickCategories, brickLoadingEntries, dispatches, invoices, people, ledgerEntries, expenses, BRICK_VEHICLE_TYPES } from "../db/schema";
import type { BrickLineItem, SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { updateLinkedExpensePaymentInfo } from "./expense.service";

type SimplePaymentMode = (typeof SIMPLE_PAYMENT_MODES)[number];
import { addLedgerEntry } from "./ledger.service";
import { deleteDispatch, isDuplicateEntryError, MAX_NUMBER_GENERATION_ATTEMPTS } from "./dispatch.service";
import { autoLogExpense } from "./expense.service";
import { summarizeItems, itemsOrLegacyFallback, bricksByCategory } from "./brickLineItems.util";
import { emitToKiln } from "../config/socket";

export type BrickVehicleType = (typeof BRICK_VEHICLE_TYPES)[number];

export interface CreateBrickLoadingInput {
  kilnId: string;
  seasonId: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  driverName?: string;
  driverPhone?: string;
  tipAmount?: number;
  // How Driver Reward/Loading Charge/Unloading Charge were each actually
  // paid — three independent choices (see SIMPLE_PAYMENT_MODES's own doc
  // comment). The *CashAmount/*OnlineAmount pair only means anything when
  // its own mode is CASH_AND_ONLINE, and must sum to that cost's own
  // amount (tipAmount / the computed loadingCharge / unloadingCharge).
  tipPaymentMode?: SimplePaymentMode;
  tipCashAmount?: number;
  tipOnlineAmount?: number;
  loadingPaymentMode?: SimplePaymentMode;
  loadingCashAmount?: number;
  loadingOnlineAmount?: number;
  unloadingPaymentMode?: SimplePaymentMode;
  unloadingCashAmount?: number;
  unloadingOnlineAmount?: number;
  vehicleType: BrickVehicleType;
  vehicleNumber: string;
  // One row per brick category loaded on this trip — quantity + this
  // trip's own admin-entered price (never defaulted from the category's
  // own pricePerBrick, since price varies customer to customer). Almost
  // always one row; more than one when a customer buys several categories
  // in the same trip. `bricksCount`/`categoryId`/`pricePerBrick`/`amount`
  // on the stored row become the aggregate across these — see
  // BrickLineItem's doc comment in db/schema/_helpers.ts.
  items: BrickLineItem[];
  unloadedBricksCount?: number;
  loadingLaborerCount?: number;
  loadingRatePerThousand?: number;
  unloadingLaborerCount?: number;
  unloadingRatePerThousand?: number;
  placeOfSupply?: string;
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

// Plain, sequential per-kiln trip counter — never resets. Deliberately
// MAX(tripNumber)+1, not COUNT(*)+1: a COUNT-based counter recomputes the
// same already-taken number forever once any row has ever been deleted
// (COUNT drops but the highest number in use doesn't), so every retry
// below would collide identically and exhaust the retry budget instead of
// recovering. MAX-based generation is gap-safe regardless of how many
// rows were deleted in between. Under MySQL this select-then-insert can
// still race between two concurrent creates for the same kiln — closed by
// the retry loop in createBrickLoadingEntry below, not by trying to make
// this atomic.
async function generateTripNumber(kilnId: string, seasonId: string) {
  const maxRow = (
    await db
      .select({ max: sql<number | null>`max(cast(${brickLoadingEntries.tripNumber} as unsigned))` })
      .from(brickLoadingEntries)
      .where(and(eq(brickLoadingEntries.kilnId, kilnId), eq(brickLoadingEntries.seasonId, seasonId)))
  )[0];
  return String((maxRow?.max ?? 0) + 1);
}

// The vehicle-loading operation record — which truck/tractor, how many
// bricks, which category — kept separate from Dispatch (the sale) and
// LoadingEntry (the palledar's wage for the physical loading labor). Every
// trip gets a unique sequential trip number and an auto-computed `amount`
// (the brick sale value alone — see the comment on finalAmount below;
// loadingCharge/unloadingCharge are tracked as entirely separate figures,
// never folded into it). Does NOT create a Dispatch — that link is
// established the other way round, from the Dispatch page's "Linked
// Loading Trip" picker (see createDispatch's loadingEntryId handling in
// dispatch.service.ts), which is also what sets this row's dispatchId.
export async function createBrickLoadingEntry(input: CreateBrickLoadingInput) {
  if (!input.items || input.items.length === 0) throw new Error("At least one brick category line item is required");

  const categoryIds = [...new Set(input.items.map((i) => i.categoryId).filter((id): id is string => !!id))];
  const categoryRows = categoryIds.length
    ? await db.select().from(brickCategories).where(and(inArray(brickCategories._id, categoryIds), eq(brickCategories.kilnId, input.kilnId)))
    : [];
  if (categoryRows.length !== categoryIds.length) throw new Error("One or more brick categories not found in this kiln");

  // Total Amount = sum across every line item's own (bricksCount x THIS
  // TRIP's admin-entered price) — never the category's own default
  // pricePerBrick; loading/unloading charges are tracked as entirely
  // separate figures below, never folded into this one.
  const { items, bricksCount: totalBricksCount, categoryId: aggregateCategoryId, pricePerBrick: aggregatePricePerBrick, amount: finalAmount } = summarizeItems(input.items);
  const loadingCharge = computeLaborCharge(totalBricksCount, input.loadingRatePerThousand);
  const unloadingCharge = computeLaborCharge(input.unloadedBricksCount, input.unloadingRatePerThousand);

  // Retry loop: two concurrent creates for the same kiln can both compute
  // the same trip number (the count-then-insert above isn't atomic under
  // MySQL) — the (kilnId, tripNumber) unique constraint is the real
  // guarantee; a collision surfaces as a duplicate-entry error, caught
  // here, and the number is simply recomputed and retried.
  let entry: typeof brickLoadingEntries.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const tripNumber = await generateTripNumber(input.kilnId, input.seasonId);
    const _id = randomUUID();
    try {
      await db.insert(brickLoadingEntries).values({
        _id,
        kilnId: input.kilnId,
        seasonId: input.seasonId,
        tripNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        tipAmount: input.tipAmount,
        tipPaymentMode: input.tipPaymentMode,
        tipCashAmount: input.tipCashAmount,
        tipOnlineAmount: input.tipOnlineAmount,
        vehicleType: input.vehicleType,
        vehicleNumber: input.vehicleNumber,
        bricksCount: totalBricksCount,
        unloadedBricksCount: input.unloadedBricksCount,
        loadingLaborerCount: input.loadingLaborerCount,
        loadingRatePerThousand: input.loadingRatePerThousand,
        loadingPaymentMode: input.loadingPaymentMode,
        loadingCashAmount: input.loadingCashAmount,
        loadingOnlineAmount: input.loadingOnlineAmount,
        unloadingLaborerCount: input.unloadingLaborerCount,
        unloadingRatePerThousand: input.unloadingRatePerThousand,
        unloadingPaymentMode: input.unloadingPaymentMode,
        unloadingCashAmount: input.unloadingCashAmount,
        unloadingOnlineAmount: input.unloadingOnlineAmount,
        categoryId: aggregateCategoryId,
        pricePerBrick: aggregatePricePerBrick,
        items,
        placeOfSupply: input.placeOfSupply,
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

  // The bricks physically left the yard on this trip — deduct from each
  // loaded category's stock the same way the Stock page's manual "loading
  // out" flow does (createStockLoadingEntry), just without a separate
  // stockLoadingEntries row, since this brickLoadingEntries row is already
  // the audit trail for the same physical movement. One deduction per
  // category line item, not just the aggregate.
  for (const item of items) {
    if (!item.categoryId) continue;
    await db.update(brickCategories)
      .set({ quantity: sql`${brickCategories.quantity} - ${item.bricksCount}` })
      .where(eq(brickCategories._id, item.categoryId));
    emitToKiln(input.kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, item.categoryId)))[0]);
  }

  emitToKiln(input.kilnId, "brickLoading:update", entry);

  // Driver reward, loading charge, and unloading charge are real costs
  // that, until now, just sat unused on this row — auto-log each as its
  // own Expense the moment the trip is created, under a fixed type name so
  // they always land in the same Expense Type bucket (see
  // expense.service.ts's autoLogExpense; no-ops for a zero/unset amount).
  await autoLogExpense(input.kilnId, entry.seasonId!, "Driver Reward / Inam", entry.tipAmount, entry.date ?? undefined, `Trip #${entry.tripNumber ?? entry._id}`, {
    brickLoadingEntryId: entry._id,
    paymentMode: entry.tipPaymentMode ?? undefined,
    cashAmount: entry.tipCashAmount ?? undefined,
    onlineAmount: entry.tipOnlineAmount ?? undefined,
  });
  await autoLogExpense(input.kilnId, entry.seasonId!, "Loading Charge", entry.loadingCharge, entry.date ?? undefined, `Trip #${entry.tripNumber ?? entry._id}`, {
    brickLoadingEntryId: entry._id,
    paymentMode: entry.loadingPaymentMode ?? undefined,
    cashAmount: entry.loadingCashAmount ?? undefined,
    onlineAmount: entry.loadingOnlineAmount ?? undefined,
  });
  await autoLogExpense(input.kilnId, entry.seasonId!, "Unloading Charge", entry.unloadingCharge, entry.date ?? undefined, `Trip #${entry.tripNumber ?? entry._id}`, {
    brickLoadingEntryId: entry._id,
    paymentMode: entry.unloadingPaymentMode ?? undefined,
    cashAmount: entry.unloadingCashAmount ?? undefined,
    onlineAmount: entry.unloadingOnlineAmount ?? undefined,
  });

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
  // Full replacement of the trip's category breakdown — when provided,
  // stock is corrected per-category by diffing against the trip's current
  // items (or its legacy single-category fields, for a pre-existing row —
  // see itemsOrLegacyFallback), and bricksCount/categoryId/pricePerBrick/
  // amount below are recomputed as the new aggregate.
  items?: BrickLineItem[];
  // Legacy single-field edit path — only used when `items` is omitted.
  bricksCount?: number;
  unloadedBricksCount?: number;
  loadingLaborerCount?: number;
  loadingRatePerThousand?: number;
  unloadingLaborerCount?: number;
  unloadingRatePerThousand?: number;
  // Admin-entered per trip — never defaulted from the category's own
  // pricePerBrick.
  pricePerBrick?: number;
  placeOfSupply?: string;
  notes?: string;
  date?: Date;
  unloadingDate?: Date;
  // Legacy — only meaningful for entries created before Driver/Tip were
  // removed from the Log Trip form, i.e. rows that already have a
  // driverId. See the driverId guard below.
  tipAmount?: number;
  tipPaymentMode?: SimplePaymentMode;
  tipCashAmount?: number;
  tipOnlineAmount?: number;
  loadingPaymentMode?: SimplePaymentMode;
  loadingCashAmount?: number;
  loadingOnlineAmount?: number;
  unloadingPaymentMode?: SimplePaymentMode;
  unloadingCashAmount?: number;
  unloadingOnlineAmount?: number;
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

  let itemsUpdate: { items?: BrickLineItem[]; bricksCount?: number; categoryId?: string; pricePerBrick?: number; amount?: number } = {};
  let newItems: BrickLineItem[] | undefined;
  if (input.items) {
    const summary = summarizeItems(input.items);
    newItems = summary.items;
    itemsUpdate = summary;
  }

  // Legacy single-field edit path — only applied when `items` wasn't sent.
  let amountUpdate: { amount?: number } = {};
  if (!input.items && (input.bricksCount !== undefined || input.pricePerBrick !== undefined)) {
    const bricksCount = input.bricksCount ?? existing.bricksCount;
    const pricePerBrick = input.pricePerBrick ?? existing.pricePerBrick ?? 0;
    amountUpdate = { amount: Math.round(bricksCount * pricePerBrick * 100) / 100 };
  }

  const effectiveBricksCount = itemsUpdate.bricksCount ?? input.bricksCount ?? existing.bricksCount;
  let chargeUpdate: { loadingCharge?: number; unloadingCharge?: number } = {};
  if (input.items || input.bricksCount !== undefined || input.loadingRatePerThousand !== undefined) {
    chargeUpdate.loadingCharge = computeLaborCharge(effectiveBricksCount, input.loadingRatePerThousand ?? existing.loadingRatePerThousand ?? undefined);
  }
  if (input.unloadedBricksCount !== undefined || input.unloadingRatePerThousand !== undefined) {
    chargeUpdate.unloadingCharge = computeLaborCharge(
      input.unloadedBricksCount ?? existing.unloadedBricksCount ?? undefined,
      input.unloadingRatePerThousand ?? existing.unloadingRatePerThousand ?? undefined
    );
  }

  await db.update(brickLoadingEntries).set({ ...input, ...itemsUpdate, ...amountUpdate, ...chargeUpdate }).where(eq(brickLoadingEntries._id, entryId));
  const updated = (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, entryId)))[0]!;

  // Stock correction. Preferred path: a full `items` replacement diffs the
  // old per-category totals against the new ones (old totals reconstructed
  // from the trip's current items, or its legacy scalar fields for a row
  // that predates this feature) and corrects each affected category by
  // exactly its delta — never re-deducting the full new total, which would
  // double-count the portion already applied. Legacy path (no `items`
  // sent, just a bare bricksCount edit): same delta correction, single
  // category, exactly as before.
  if (newItems) {
    const oldItems = itemsOrLegacyFallback(existing);
    const oldByCategory = bricksByCategory(oldItems);
    const newByCategory = bricksByCategory(newItems);
    const allCategoryIds = new Set([...oldByCategory.keys(), ...newByCategory.keys()]);
    for (const catId of allCategoryIds) {
      const delta = (newByCategory.get(catId) ?? 0) - (oldByCategory.get(catId) ?? 0);
      if (delta !== 0) {
        await db.update(brickCategories).set({ quantity: sql`${brickCategories.quantity} - ${delta}` }).where(eq(brickCategories._id, catId));
        emitToKiln(kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, catId)))[0]);
      }
    }
  } else if (input.bricksCount !== undefined && existing.categoryId) {
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

  // Carries a payment-mode/split correction through to the already-created
  // Expense row for that specific cost (see updateLinkedExpensePaymentInfo)
  // — the amount itself was already auto-logged at creation and is never
  // rewritten here, only how it was paid. This is what lets Edit Mode fill
  // in payment details for a trip created before this feature existed.
  if (input.tipPaymentMode !== undefined || input.tipCashAmount !== undefined || input.tipOnlineAmount !== undefined) {
    await updateLinkedExpensePaymentInfo(kilnId, { brickLoadingEntryId: entryId }, "Driver Reward / Inam", {
      paymentMode: input.tipPaymentMode,
      cashAmount: input.tipCashAmount,
      onlineAmount: input.tipOnlineAmount,
    });
  }
  if (input.loadingPaymentMode !== undefined || input.loadingCashAmount !== undefined || input.loadingOnlineAmount !== undefined) {
    await updateLinkedExpensePaymentInfo(kilnId, { brickLoadingEntryId: entryId }, "Loading Charge", {
      paymentMode: input.loadingPaymentMode,
      cashAmount: input.loadingCashAmount,
      onlineAmount: input.loadingOnlineAmount,
    });
  }
  if (input.unloadingPaymentMode !== undefined || input.unloadingCashAmount !== undefined || input.unloadingOnlineAmount !== undefined) {
    await updateLinkedExpensePaymentInfo(kilnId, { brickLoadingEntryId: entryId }, "Unloading Charge", {
      paymentMode: input.unloadingPaymentMode,
      cashAmount: input.unloadingCashAmount,
      onlineAmount: input.unloadingOnlineAmount,
    });
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
// Also deletes this trip's own auto-logged Expense rows (see below) and,
// via deleteDispatch when linked, everything that dispatch generated too.
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
    // Cascades Challan/Gate Pass/Invoice/dispatch-level Expense too — see
    // deleteDispatch's own doc comment in dispatch.service.ts.
    await deleteDispatch(kilnId, existing.dispatchId);
  } else {
    for (const item of itemsOrLegacyFallback(existing)) {
      if (!item.categoryId) continue;
      await db.update(brickCategories)
        .set({ quantity: sql`${brickCategories.quantity} + ${item.bricksCount}` })
        .where(eq(brickCategories._id, item.categoryId));
      emitToKiln(kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, item.categoryId)))[0]);
    }
  }

  // The three auto-logged Expense rows this trip created at creation time
  // (Driver Reward/Inam, Loading Charge, Unloading Charge — see
  // createBrickLoadingEntry) — found via brickLoadingEntryId, the real FK
  // set at creation for exactly this purpose.
  const linkedExpenses = await db.select({ _id: expenses._id }).from(expenses).where(and(eq(expenses.brickLoadingEntryId, entryId), eq(expenses.kilnId, kilnId)));
  for (const row of linkedExpenses) {
    await db.delete(expenses).where(eq(expenses._id, row._id));
    emitToKiln(kilnId, "expense:update", { _id: row._id, deleted: true });
  }

  await db.delete(brickLoadingEntries).where(eq(brickLoadingEntries._id, entryId));
  emitToKiln(kilnId, "brickLoading:update", { _id: entryId, deleted: true });
}

export interface ListBrickLoadingFilter {
  driverId?: string;
  days?: number;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// report.service.ts's full person report).
export async function listBrickLoadingEntries(kilnId: string, seasonId: string | null, filter: ListBrickLoadingFilter = {}) {
  const conditions = [eq(brickLoadingEntries.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(brickLoadingEntries.seasonId, seasonId));
  if (filter.driverId) conditions.push(eq(brickLoadingEntries.driverId, filter.driverId));
  if (filter.days) {
    const since = new Date();
    since.setDate(since.getDate() - filter.days);
    conditions.push(gte(brickLoadingEntries.date, since));
  }
  if (filter.from) conditions.push(gte(brickLoadingEntries.date, filter.from));
  if (filter.to) conditions.push(lte(brickLoadingEntries.date, filter.to));

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
  const categoryIds = [
    ...new Set([
      ...rows.map((r) => r.categoryId).filter((v): v is string => !!v),
      ...rows.flatMap((r) => (r.items ?? []).map((i) => i.categoryId).filter((v): v is string => !!v)),
    ]),
  ];
  const [driverRows, dispatchRows, categoryRows, invoiceRows] = await Promise.all([
    driverIds.length ? db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, driverIds)) : [],
    // paymentMode/cashAmount/onlineAmount/amount included so read paths
    // (the Production > Brick Loading report especially) can show how the
    // customer's own payment for the bricks broke down cash-vs-online —
    // that split is never stored on brickLoadingEntries itself, only on
    // whichever Dispatch it's linked to. The dispatch's own `amount` is
    // included too because it's the true NET billed figure (post any
    // discount applied when the dispatch was created/edited) — this row's
    // own `amount` is a frozen snapshot from trip-creation time and never
    // gets updated for a discount applied later at the dispatch stage, so
    // it can legitimately disagree with what cashAmount+onlineAmount sum
    // to.
    dispatchIds.length
      ? db
          .select({ _id: dispatches._id, slipNumber: dispatches.slipNumber, customerName: dispatches.customerName, amount: dispatches.amount, paymentMode: dispatches.paymentMode, cashAmount: dispatches.cashAmount, onlineAmount: dispatches.onlineAmount })
          .from(dispatches)
          .where(inArray(dispatches._id, dispatchIds))
      : [],
    categoryIds.length ? db.select({ _id: brickCategories._id, category: brickCategories.category, grade: brickCategories.grade }).from(brickCategories).where(inArray(brickCategories._id, categoryIds)) : [],
    // A Dispatch's own paymentMode/cashAmount/onlineAmount describe how its
    // full `amount` was paid — there's no partial-payment concept at the
    // dispatch level at all. But a dispatch that's been formally invoiced
    // can be genuinely PARTIALLY paid (invoices.amountPaidNow < netAmount,
    // a real "customer paid some now, rest due later" case) — the invoice
    // is the authoritative record of that, so it's resolved here too and
    // preferred over the dispatch's own fields wherever one exists (see the
    // Production > Brick Loading report, the main consumer of this).
    dispatchIds.length
      ? db
          .select({ dispatchId: invoices.dispatchId, netAmount: invoices.netAmount, amountPaidNow: invoices.amountPaidNow, paymentMode: invoices.paymentMode, cashAmount: invoices.cashAmount, onlineAmount: invoices.onlineAmount })
          .from(invoices)
          .where(and(eq(invoices.kilnId, kilnId), inArray(invoices.dispatchId, dispatchIds)))
      : [],
  ]);
  const driverById = new Map(driverRows.map((d) => [d._id, d]));
  const invoiceByDispatchId = new Map(invoiceRows.filter((i) => i.dispatchId).map((i) => [i.dispatchId as string, i]));
  const dispatchById = new Map(
    dispatchRows.map((d) => {
      const inv = invoiceByDispatchId.get(d._id);
      return [
        d._id,
        {
          ...d,
          invoicePaidNow: inv ? inv.amountPaidNow ?? inv.netAmount : (undefined as number | undefined),
          invoicePaymentMode: inv?.paymentMode,
          invoiceCashAmount: inv?.cashAmount,
          invoiceOnlineAmount: inv?.onlineAmount,
        },
      ];
    })
  );
  const categoryById = new Map(categoryRows.map((c) => [c._id, c]));
  return rows.map((r) => ({
    ...r,
    items: r.items?.map((i) => ({ ...i, categoryId: i.categoryId ? categoryById.get(i.categoryId) ?? i.categoryId : i.categoryId })),
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
export async function brickLoadingDriverSummary(kilnId: string, seasonId: string) {
  const drivers = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "DRIVER"), eq(people.active, true))).orderBy(asc(people.name));

  const allEntries = await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries.kilnId, kilnId), eq(brickLoadingEntries.seasonId, seasonId)));
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

    // Ledger balance stays all-time regardless of seasonId (see
    // listLedgerForPerson's doc comment in ledger.service.ts) — seasonId on
    // a ledger entry is optional and several real entries predate it, so
    // hard-filtering here would silently understate a driver's balance
    // relative to every other balance display in the app.
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
