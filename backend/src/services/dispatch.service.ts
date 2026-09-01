import { randomUUID } from "crypto";
import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { dispatches, people, brickCategories, brickLoadingEntries, kilns, challans, gatePasses, invoices, expenses, BRICK_GRADES, DISPATCH_PAYMENT_MODES } from "../db/schema";
import type { BrickLineItem, SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { updateLinkedExpensePaymentInfo } from "./expense.service";

type SimplePaymentMode = (typeof SIMPLE_PAYMENT_MODES)[number];
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { recordStockEntry } from "./stock.service";
import { createCustomer, findCustomerByName } from "./customer.service";
import { autoLogExpense } from "./expense.service";
import { summarizeItems, itemsOrLegacyFallback, bricksByCategory } from "./brickLineItems.util";
import { emitToKiln } from "../config/socket";

export type BrickGrade = (typeof BRICK_GRADES)[number];
export type PaymentMode = (typeof DISPATCH_PAYMENT_MODES)[number];

const GRADE_STOCK_ITEM: Record<BrickGrade, string> = {
  A1: "Bricks (A-1 Grade)",
  JHAMA: "Bricks (Jhama)",
  PELA: "Bricks (Pela/Seem)",
};

// Same server-local-midnight convention used everywhere else in this app
// (see attendance.service.ts's startOfDay) — keeps the slip number's "day"
// boundary consistent with how every other day-bucketed query in this
// codebase already resolves it.
function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = startOfDay(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDDMMYYYY(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getFullYear()}`;
}

// e.g. "JVS Bricks" -> "JVS" — the kiln's own short prefix, not a fixed
// abbreviation scheme. Exported for dispatchDocuments.service.ts's GST
// invoice number ({kilnPrefix}/{session}/{sessionSerialNumber}) — same
// prefix rule, no reason to duplicate it.
export function kilnPrefix(kilnName: string) {
  const firstWord = kilnName.trim().split(/\s+/)[0] ?? "";
  const alnum = firstWord.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return alnum || "KILN";
}

// Human-readable and sequential per kiln per calendar day — e.g.
// "JVS-16-08-2026-01" — so a munim can read a slip number straight off a
// printed Gate Pass/Challan and know the kiln, the day, and which dispatch
// of that day it was, instead of an opaque random code. Resets to 01 every
// day. Under MySQL this count-then-insert CAN race between two concurrent
// same-day creates for the same kiln (unlike the old synchronous
// better-sqlite3 driver) — createDispatch below closes that gap with a
// retry loop against the (kilnId, slipNumber) unique constraint, not by
// trying to make this function itself atomic.
async function generateSlipNumber(kilnId: string, seasonId: string, dispatchedOn: Date) {
  const kiln = (await db.select({ name: kilns.name }).from(kilns).where(eq(kilns._id, kilnId)))[0];
  const prefix = kilnPrefix(kiln?.name ?? "KILN");
  const dayStart = startOfDay(dispatchedOn);
  const dayEnd = endOfDay(dispatchedOn);
  const countRow = (await db
    .select({ count: sql<number>`count(*)` })
    .from(dispatches)
    .where(and(eq(dispatches.kilnId, kilnId), eq(dispatches.seasonId, seasonId), gte(dispatches.dispatchedOn, dayStart), lte(dispatches.dispatchedOn, dayEnd))))[0];
  const seq = (countRow?.count ?? 0) + 1;
  return `${prefix}-${formatDDMMYYYY(dayStart)}-${String(seq).padStart(2, "0")}`;
}

// A plain, sequential per-kiln invoice counter ("1", "2", ... "61") — this
// is what actually prints on the Challan, matching the kiln's real paper
// invoice book. Never resets; unlike the slip number's daily reset, an
// invoice book's numbering runs continuously. Same race caveat as
// generateSlipNumber above — closed by createDispatch's retry loop, not
// here.
async function generateInvoiceNumber(kilnId: string, seasonId: string) {
  const countRow = (await db.select({ count: sql<number>`count(*)` }).from(dispatches).where(and(eq(dispatches.kilnId, kilnId), eq(dispatches.seasonId, seasonId))))[0];
  return String((countRow?.count ?? 0) + 1);
}

// MySQL's duplicate-entry error, thrown when an insert collides with an
// existing unique constraint (here: (kilnId, slipNumber) or (kilnId,
// invoiceNumber)) — the actual correctness guarantee createDispatch's
// retry loop relies on, since the count-then-insert above can no longer
// assume synchronous, race-free execution the way it could under
// better-sqlite3.
// Drizzle wraps the real mysql2 error inside a DrizzleQueryError, with the
// actual driver error (the one carrying `.code`) on `.cause` — not on the
// thrown error directly. Checked both places since that wrapping isn't
// guaranteed across drizzle-orm versions.
export function isDuplicateEntryError(err: unknown): boolean {
  const hasCode = (e: unknown): boolean => !!e && typeof e === "object" && (e as { code?: unknown }).code === "ER_DUP_ENTRY";
  return hasCode(err) || hasCode((err as { cause?: unknown } | undefined)?.cause);
}

export interface CreateDispatchInput {
  kilnId: string;
  seasonId: string;
  customerName: string;
  customerId?: string;
  customerAddress?: string;
  customerPhone?: string;
  grade?: BrickGrade;
  bricksCount: number;
  amount: number;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  transportCost?: number;
  transportPaidBy?: "OWNER" | "CUSTOMER";
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  categoryId?: string;
  // Multi-category breakdown for a manually-created dispatch — see
  // BrickLineItem's doc comment in db/schema/_helpers.ts. Ignored (and
  // overridden) when `loadingEntryId` is given below, same as
  // bricksCount/categoryId/amount — a trip-linked dispatch's items always
  // come from the trip itself.
  items?: BrickLineItem[];
  vehicleNumber?: string;
  vehicleType?: string;
  driverTipAmount?: number;
  // How the Driver Reward above was paid — see SIMPLE_PAYMENT_MODES's own
  // doc comment. Like driverTipAmount itself, the Log Dispatch form
  // pre-fills these from the linked trip's own tipPaymentMode/
  // tipCashAmount/tipOnlineAmount when a trip is selected (client-side,
  // see Dispatch.tsx's handleTripSelect) but they stay admin-editable from
  // there — never server-overridden the way bricksCount/categoryId/etc.
  // are for a trip-linked dispatch.
  driverTipPaymentMode?: SimplePaymentMode;
  driverTipCashAmount?: number;
  driverTipOnlineAmount?: number;
  // When given, `amount` above is treated as the GROSS figure and the
  // stored/billed `amount` becomes `amount - discountAmount` — see
  // brickLoading.service.ts's auto-dispatch flow, the primary caller of
  // this. Manual dispatch creation may also pass this for display, in
  // which case the same netting applies.
  discountAmount?: number;
  // Editable even when auto-filled from a linked loading trip (unlike
  // bricksCount/categoryId/vehicleNumber/vehicleType/discountAmount/amount
  // below, which the loadingEntryId branch always overrides).
  placeOfSupply?: string;
  notes?: string;
  dispatchedOn?: Date;
  // When given, this dispatch is created FROM an existing, not-yet-linked
  // Brick Loading trip — the Log Dispatch form's "Linked Loading Trip"
  // picker (the reverse direction of createBrickLoadingEntry's own
  // auto-dispatch step). bricksCount/categoryId/vehicleNumber/vehicleType/
  // discountAmount/amount are all pulled authoritatively from that trip
  // row, overriding whatever the client sent for them, so the two records
  // can never drift out of sync with each other.
  loadingEntryId?: string;
  // When given, this dispatch is (partially) fulfilling a pending Sale
  // Order — see saleOrder.service.ts's fulfillSaleOrder, the only caller
  // that sets this. Purely a pass-through link; createDispatch itself does
  // not touch the sale order's own bricksFulfilled/status bookkeeping.
  saleOrderId?: string;
}

export const MAX_NUMBER_GENERATION_ATTEMPTS = 5;

// Every dispatch gets a slip number the moment it's created — the point
// isn't gate hardware (out of scope here), it's that "no record, no
// number" makes an un-logged truck exit the exception a munim would have
// to actively avoid creating, not the default. If it's on credit
// (customerId given, no full payment recorded elsewhere), the sale posts
// as a DUE against the customer — see Person.ts for why DUE/PAID mean the
// opposite of what they mean for a worker.
export async function createDispatch(rawInput: CreateDispatchInput) {
  if (rawInput.driverId) {
    await assertPersonOfType(rawInput.kilnId, rawInput.driverId, ["DRIVER"]);
  }
  if (rawInput.customerId) {
    await assertPersonOfType(rawInput.kilnId, rawInput.customerId, ["CUSTOMER"]);
  }

  // The Log Dispatch form's "Linked Loading Trip" picker — bricksCount/
  // categoryId/vehicleNumber/vehicleType/discountAmount/amount are pulled
  // authoritatively from the trip row itself (never trusted from the
  // client) so the two records can't drift out of sync. Mirrors, in
  // reverse, what createBrickLoadingEntry's own auto-dispatch step does.
  let input = rawInput;
  let loadingEntry: typeof brickLoadingEntries.$inferSelect | undefined;
  if (rawInput.loadingEntryId) {
    loadingEntry = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries._id, rawInput.loadingEntryId), eq(brickLoadingEntries.kilnId, rawInput.kilnId))))[0];
    if (!loadingEntry) throw new Error("Linked loading trip not found in this kiln");
    if (loadingEntry.dispatchId) throw new Error("This loading trip is already linked to a dispatch");
    input = {
      ...rawInput,
      bricksCount: loadingEntry.bricksCount,
      categoryId: loadingEntry.categoryId ?? undefined,
      // The trip's own category breakdown, carried through wholesale —
      // never trusted from the client, same as every other field here.
      items: itemsOrLegacyFallback(loadingEntry),
      vehicleNumber: loadingEntry.vehicleNumber,
      vehicleType: loadingEntry.vehicleType,
      discountAmount: loadingEntry.discountAmount ?? undefined,
      // The entry's own `amount` is already fully net (category price ×
      // bricks − discount + loading/unloading charges) — reconstructing a
      // "gross" as amount+discount and passing discountAmount separately
      // lets the netting below reproduce exactly that figure, the same
      // pattern brickLoading.service.ts's own auto-dispatch call uses.
      amount: (loadingEntry.amount ?? 0) + (loadingEntry.discountAmount ?? 0),
    };
    // Inherits the trip's own seasonId rather than the request's current
    // one — a dispatch created from a trip logged in an earlier season
    // stays filed under that same season, keeping the trip→dispatch chain
    // internally consistent even if a season switch happened in between.
    input.seasonId = loadingEntry.seasonId ?? rawInput.seasonId;
  } else if (rawInput.items && rawInput.items.length > 0) {
    // A manually-created multi-category dispatch — normalize `items` and
    // let its own aggregate bricksCount/categoryId feed the rest of this
    // function the same way a trip-linked one does (amount/discount stay
    // whatever the admin typed at the top level, since Dispatch has no
    // per-line price input the way Brick Loading does — items here just
    // carry the category/quantity breakdown for the print/detail views).
    const summary = summarizeItems(rawInput.items);
    input = { ...rawInput, items: summary.items, bricksCount: summary.bricksCount, categoryId: summary.categoryId ?? rawInput.categoryId };
  }

  // Stock deduction is keyed by `grade`, an older fixed A1/JHAMA/PELA
  // classification independent of the free-form `categoryId`. The Log
  // Dispatch form no longer asks for grade at all — when omitted, derive
  // it from the chosen category's own optional `.grade` tag (falling back
  // to "A1") so stock still comes out of the bucket that actually matches
  // what was sold, instead of always defaulting to A1 regardless of
  // category.
  let grade = input.grade;
  if (!grade && input.categoryId) {
    const category = (await db.select({ grade: brickCategories.grade }).from(brickCategories).where(eq(brickCategories._id, input.categoryId)))[0];
    grade = (category?.grade as BrickGrade | undefined) ?? "A1";
  }

  // `amount` is always the net, billed figure everywhere downstream
  // (revenue totals, financial reports) — discount is applied here once,
  // at creation, rather than left for every consumer to remember to
  // subtract. `discountAmount` itself is kept only for transparent
  // display on the Challan.
  const netAmount = input.discountAmount ? Math.round((input.amount - input.discountAmount) * 100) / 100 : input.amount;

  // Resolved once so the slip number's date component and the row's own
  // dispatchedOn always agree — letting Drizzle's own $defaultFn pick a
  // separate `new Date()` at insert time could disagree by the odd
  // millisecond and, right at midnight, land on a different calendar day.
  const dispatchedOn = input.dispatchedOn ?? new Date();

  // Retry loop: two concurrent createDispatch calls for the same kiln can
  // both compute the same slip/invoice number (the count-then-insert below
  // isn't atomic under MySQL). The (kilnId, slipNumber)/(kilnId,
  // invoiceNumber) unique constraints are the real guarantee — a collision
  // surfaces as a duplicate-entry error, caught here, and the numbers are
  // simply recomputed and retried.
  let dispatch: typeof dispatches.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const slipNumber = await generateSlipNumber(input.kilnId, input.seasonId, dispatchedOn);
    const invoiceNumber = await generateInvoiceNumber(input.kilnId, input.seasonId);
    const _id = randomUUID();
    const { loadingEntryId: _loadingEntryId, ...insertableInput } = input;
    try {
      await db.insert(dispatches).values({ ...insertableInput, grade, amount: netAmount, dispatchedOn, _id, slipNumber, invoiceNumber });
      dispatch = (await db.select().from(dispatches).where(eq(dispatches._id, _id)))[0];
      break;
    } catch (err) {
      lastError = err;
      if (!isDuplicateEntryError(err)) throw err;
      // Otherwise: another request won this exact number just now — loop
      // around and recompute against the now-updated count.
    }
  }
  if (!dispatch) {
    throw lastError instanceof Error ? lastError : new Error("Failed to create dispatch: could not allocate a unique slip/invoice number");
  }

  if (loadingEntry) {
    await db.update(brickLoadingEntries).set({ dispatchId: dispatch._id }).where(eq(brickLoadingEntries._id, loadingEntry._id));
    emitToKiln(input.kilnId, "brickLoading:update", (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, loadingEntry._id)))[0]);

    // The Loading Trip form's Customer/Party Name field offers existing
    // Customer profiles as suggestions, but never forces a pick — so once
    // this trip actually becomes a Dispatch, resolve that typed name
    // against the Customer list one more time and auto-create a profile
    // for it if nothing matched, carrying over every detail the trip
    // itself collected. A name that already matches an existing profile is
    // left untouched (never duplicated).
    if (loadingEntry.customerName?.trim() && !(await findCustomerByName(input.kilnId, loadingEntry.customerName))) {
      await createCustomer(input.kilnId, {
        name: loadingEntry.customerName.trim(),
        phones: loadingEntry.customerPhone ? [loadingEntry.customerPhone] : [],
        addresses: loadingEntry.customerAddress ? [loadingEntry.customerAddress] : [],
        drivers: loadingEntry.driverName ? [{ name: loadingEntry.driverName, phone: loadingEntry.driverPhone ?? "", address: "" }] : [],
        vehicles: [{ vehicleType: loadingEntry.vehicleType, vehicleNumber: loadingEntry.vehicleNumber }],
      });
    }
  }

  if (input.customerId) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.customerId,
      direction: "DUE",
      amount: netAmount,
      reason: `Sale: ${input.bricksCount.toLocaleString()} bricks (${dispatch.slipNumber})`,
      date: dispatchedOn,
    });
  }

  // Bricks leaving on this truck have to come back out of finished-goods
  // stock the same way a return puts them back in (see
  // recordDeliveryAdjustment below) — without this, stock only ever grows
  // from chamber grading and never shrinks from a sale, which is exactly
  // the kind of gap reconcileFinishedGoods exists to catch.
  await recordStockEntry({
    kilnId: input.kilnId,
    seasonId: dispatch.seasonId!,
    type: "FINISHED_GOODS",
    itemName: GRADE_STOCK_ITEM[(grade ?? "A1") as BrickGrade],
    quantity: -input.bricksCount,
  });

  emitToKiln(input.kilnId, "dispatch:update", dispatch);

  // Same auto-log as brickLoading.service.ts's createBrickLoadingEntry —
  // driverTipAmount here never had any other effect (see this interface's
  // own comment above) and would double-count if this dispatch came from a
  // loading trip (that trip already logs its own tip separately), but
  // BrickLoadingTripDetailPage's "Add to Dispatch" never sends
  // driverTipAmount, so that path is safe by construction.
  await autoLogExpense(input.kilnId, dispatch.seasonId!, "Driver Reward / Inam", dispatch.driverTipAmount, dispatchedOn, `Dispatch ${dispatch.slipNumber}`, {
    dispatchId: dispatch._id,
    paymentMode: dispatch.driverTipPaymentMode ?? undefined,
    cashAmount: dispatch.driverTipCashAmount ?? undefined,
    onlineAmount: dispatch.driverTipOnlineAmount ?? undefined,
  });

  return dispatch;
}

export interface DeliveryAdjustmentInput {
  breakageCount?: number;
  returnedCount?: number;
  returnReason?: string;
}

// Applied after the truck comes back — breakage/return counts aren't known
// at booking time. A return also reverses part of the customer's debt and
// puts the (undamaged) returned bricks back in finished-goods stock; the
// broken portion is just recorded, not reversed, since it's gone either way.
export async function recordDeliveryAdjustment(kilnId: string, dispatchId: string, input: DeliveryAdjustmentInput) {
  const dispatch = (await db.select().from(dispatches).where(and(eq(dispatches._id, dispatchId), eq(dispatches.kilnId, kilnId))))[0];
  if (!dispatch) throw new Error("Dispatch not found in this kiln");

  const update: Record<string, unknown> = {};
  if (input.breakageCount != null) update.breakageCount = input.breakageCount;
  if (input.returnedCount != null) update.returnedCount = input.returnedCount;
  if (input.returnReason != null) update.returnReason = input.returnReason;

  if (Object.keys(update).length > 0) {
    await db.update(dispatches).set(update).where(eq(dispatches._id, dispatchId));
  }
  const updated = (await db.select().from(dispatches).where(eq(dispatches._id, dispatchId)))[0]!;

  if (input.returnedCount && input.returnedCount > 0) {
    const unitPrice = dispatch.bricksCount > 0 ? dispatch.amount / dispatch.bricksCount : 0;
    const refundAmount = Math.round(unitPrice * input.returnedCount);

    if (dispatch.customerId && refundAmount > 0) {
      await addLedgerEntry({
        kilnId,
        personId: dispatch.customerId,
        direction: "PAID",
        amount: refundAmount,
        reason: `Return adjustment: ${input.returnedCount} bricks (${dispatch.slipNumber})`,
      });
    }

    await recordStockEntry({
      kilnId,
      seasonId: dispatch.seasonId!,
      type: "FINISHED_GOODS",
      itemName: GRADE_STOCK_ITEM[dispatch.grade as BrickGrade] ?? GRADE_STOCK_ITEM.A1,
      quantity: input.returnedCount,
    });
  }

  emitToKiln(kilnId, "dispatch:update", updated);
  return updated;
}

// Every dispatch with a breakage or return recorded against it, across
// every season — the "List of Cash Returns" report. seasonId-agnostic,
// same reasoning as listDispatchesForCustomer: a return can be recorded on
// a dispatch from an earlier season and should stay visible regardless.
export async function listReturnedDispatches(kilnId: string, filter: { from?: Date; to?: Date } = {}) {
  const conditions = [eq(dispatches.kilnId, kilnId), gt(sql<number>`${dispatches.breakageCount} + ${dispatches.returnedCount}`, 0)];
  if (filter.from) conditions.push(gte(dispatches.dispatchedOn, filter.from));
  if (filter.to) conditions.push(lte(dispatches.dispatchedOn, filter.to));
  return db.select().from(dispatches).where(and(...conditions)).orderBy(desc(dispatches.dispatchedOn));
}

export interface UpdateDispatchInput {
  customerName?: string;
  customerId?: string | null;
  customerAddress?: string;
  customerPhone?: string;
  grade?: BrickGrade;
  bricksCount?: number;
  amount?: number;
  discountAmount?: number;
  driverId?: string | null;
  driverName?: string;
  driverPhone?: string;
  transportCost?: number;
  transportPaidBy?: "OWNER" | "CUSTOMER";
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  categoryId?: string | null;
  // Full replacement of the category breakdown — only meaningful for a
  // manually-created (non-trip-linked) dispatch; a trip-linked dispatch's
  // items always come from the trip itself. See CreateDispatchInput.items.
  items?: BrickLineItem[];
  vehicleNumber?: string;
  vehicleType?: string;
  driverTipAmount?: number;
  driverTipPaymentMode?: SimplePaymentMode;
  driverTipCashAmount?: number;
  driverTipOnlineAmount?: number;
  placeOfSupply?: string;
  notes?: string;
  dispatchedOn?: Date;
}

// Corrects a dispatch after the fact (wrong customer, wrong amount, wrong
// bricksCount, ...) without ever rewriting what was already posted to the
// ledger or stock — same delta-correction convention as
// updatePaymentReceipt/updateBrickLoadingEntry: post a new correction entry
// for exactly the difference, never mutate the original. slipNumber and
// invoiceNumber never change here, so a reprinted Gate Pass/Challan still
// carries the same serial the original did.
export async function updateDispatch(kilnId: string, dispatchId: string, input: UpdateDispatchInput) {
  const existing = (await db.select().from(dispatches).where(and(eq(dispatches._id, dispatchId), eq(dispatches.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Dispatch not found in this kiln");

  if (input.driverId) {
    await assertPersonOfType(kilnId, input.driverId, ["DRIVER"]);
  }
  if (input.customerId) {
    await assertPersonOfType(kilnId, input.customerId, ["CUSTOMER"]);
  }

  const patch: Record<string, unknown> = {};
  for (const key of [
    "customerName", "customerAddress", "customerPhone", "grade", "driverId",
    "driverName", "driverPhone", "transportCost", "transportPaidBy",
    "paymentMode", "cashAmount", "onlineAmount", "categoryId", "vehicleNumber",
    "vehicleType", "driverTipAmount", "driverTipPaymentMode", "driverTipCashAmount",
    "driverTipOnlineAmount", "placeOfSupply", "notes", "dispatchedOn",
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  // A full `items` replacement recomputes the aggregate bricksCount/
  // categoryId the same way createDispatch does — only meaningful for a
  // manual dispatch (a trip-linked one's items always come from the trip).
  let newItemsSummary: ReturnType<typeof summarizeItems> | undefined;
  if (input.items) {
    newItemsSummary = summarizeItems(input.items);
    patch.items = newItemsSummary.items;
    patch.bricksCount = newItemsSummary.bricksCount;
    patch.categoryId = newItemsSummary.categoryId ?? null;
  }

  // `amount` (if given) is the GROSS figure, same convention createDispatch
  // uses — recompute the net the same way so editing either amount or
  // discountAmount alone still nets correctly.
  const currentGross = existing.amount + (existing.discountAmount ?? 0);
  const newGross = input.amount !== undefined ? input.amount : currentGross;
  const newDiscount = input.discountAmount !== undefined ? input.discountAmount : (existing.discountAmount ?? 0);
  // Guards a partial edit (e.g. discountAmount changed without amount also
  // being resent) the same way createDispatch's caller-side schema guards
  // creation — a discount bigger than the gross would net to a negative
  // `amount`, corrupting every downstream revenue total.
  if (newDiscount > newGross) {
    throw new Error("discountAmount cannot exceed amount");
  }
  const newNetAmount = Math.round((newGross - newDiscount) * 100) / 100;
  const amountChanged = newNetAmount !== existing.amount;
  if (amountChanged || input.discountAmount !== undefined) {
    patch.amount = newNetAmount;
    patch.discountAmount = newDiscount;
  }

  const customerChanged = input.customerId !== undefined && (input.customerId ?? null) !== (existing.customerId ?? null);
  if (customerChanged) {
    patch.customerId = input.customerId;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(dispatches).set(patch).where(eq(dispatches._id, dispatchId));
  }
  const updated = (await db.select().from(dispatches).where(eq(dispatches._id, dispatchId)))[0]!;

  // Ledger: a customer reassignment reverses the full original DUE off the
  // old customer and posts a fresh DUE on the new one; otherwise, only the
  // net-amount delta (if any) gets corrected on the existing customer.
  if (customerChanged) {
    if (existing.customerId && existing.amount !== 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.customerId,
        direction: "PAID",
        amount: existing.amount,
        reason: `Dispatch ${existing.slipNumber} reassigned to a different customer — reversing ₹${existing.amount.toLocaleString("en-IN")}`,
      });
    }
    if (input.customerId && newNetAmount !== 0) {
      await addLedgerEntry({
        kilnId,
        personId: input.customerId,
        direction: "DUE",
        amount: newNetAmount,
        reason: `Sale: ${(input.bricksCount ?? existing.bricksCount).toLocaleString()} bricks (${existing.slipNumber}) — reassigned from another customer`,
      });
    }
  } else if (existing.customerId && amountChanged) {
    const delta = Math.round((newNetAmount - existing.amount) * 100) / 100;
    if (delta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.customerId,
        direction: "DUE",
        amount: delta,
        reason: `Dispatch ${existing.slipNumber} correction: revised up to ₹${newNetAmount.toLocaleString("en-IN")}`,
      });
    } else if (delta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.customerId,
        direction: "PAID",
        amount: -delta,
        reason: `Dispatch ${existing.slipNumber} correction: revised down to ₹${newNetAmount.toLocaleString("en-IN")}`,
      });
    }
  }

  // Stock: correct the grade-bucket deduction by the exact delta rather
  // than re-deducting the new total, which would double-count. A grade
  // change moves the whole quantity from the old bucket to the new one.
  const bricksCountChanged =
    (input.bricksCount !== undefined && input.bricksCount !== existing.bricksCount) ||
    (newItemsSummary !== undefined && newItemsSummary.bricksCount !== existing.bricksCount);
  const gradeChanged = input.grade !== undefined && input.grade !== existing.grade;
  const newBricksCount = newItemsSummary?.bricksCount ?? input.bricksCount ?? existing.bricksCount;
  if (bricksCountChanged || gradeChanged) {
    if (input.bricksCount !== undefined && !newItemsSummary) {
      await db.update(dispatches).set({ bricksCount: input.bricksCount }).where(eq(dispatches._id, dispatchId));
    }

    const oldGrade = (existing.grade ?? "A1") as BrickGrade;
    const newGrade = (input.grade ?? existing.grade ?? "A1") as BrickGrade;
    if (oldGrade === newGrade) {
      const delta = newBricksCount - existing.bricksCount;
      if (delta !== 0) {
        await recordStockEntry({ kilnId, seasonId: existing.seasonId!, type: "FINISHED_GOODS", itemName: GRADE_STOCK_ITEM[oldGrade], quantity: -delta });
      }
    } else {
      await recordStockEntry({ kilnId, seasonId: existing.seasonId!, type: "FINISHED_GOODS", itemName: GRADE_STOCK_ITEM[oldGrade], quantity: existing.bricksCount });
      await recordStockEntry({ kilnId, seasonId: existing.seasonId!, type: "FINISHED_GOODS", itemName: GRADE_STOCK_ITEM[newGrade], quantity: -newBricksCount });
    }
  }

  // Brick-Loading-linked dispatches keep a second, independent stock
  // system (brickCategories.quantity) — correct that too, the same
  // per-category delta-diff convention updateBrickLoadingEntry uses for
  // its own edits (never re-deducting a full new total, which would
  // double-count). `items` (old, reconstructed from legacy scalar fields
  // when this row predates multi-category support) is diffed against
  // whichever of `items`/`categoryId`/`bricksCount` the admin actually
  // changed.
  const categoryChanged = input.categoryId !== undefined && input.categoryId !== existing.categoryId;
  if (bricksCountChanged || categoryChanged || newItemsSummary) {
    const linkedEntry = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries.dispatchId, dispatchId), eq(brickLoadingEntries.kilnId, kilnId))))[0];
    if (linkedEntry) {
      const oldItems = itemsOrLegacyFallback(existing);
      const newItems: BrickLineItem[] = newItemsSummary
        ? newItemsSummary.items
        : [{ categoryId: (input.categoryId !== undefined ? input.categoryId : existing.categoryId) ?? undefined, bricksCount: newBricksCount }];
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
    }
  }

  // Carries a Driver Reward payment-mode/split correction through to the
  // already-created Expense row (see updateBrickLoadingEntry's identical
  // pattern) — the amount itself was already auto-logged at creation and
  // is never rewritten here, only how it was paid.
  if (input.driverTipPaymentMode !== undefined || input.driverTipCashAmount !== undefined || input.driverTipOnlineAmount !== undefined) {
    await updateLinkedExpensePaymentInfo(kilnId, { dispatchId }, "Driver Reward / Inam", {
      paymentMode: input.driverTipPaymentMode,
      cashAmount: input.driverTipCashAmount,
      onlineAmount: input.driverTipOnlineAmount,
    });
  }

  const finalDispatch = (await db.select().from(dispatches).where(eq(dispatches._id, dispatchId)))[0]!;
  emitToKiln(kilnId, "dispatch:update", finalDispatch);
  return finalDispatch;
}

// Deletes a dispatch and reverses every side effect it caused: the ledger
// DUE (netted against any return already refunded, so a returned dispatch
// isn't double-reversed), the finished-goods stock deduction (same
// netting), and — if this dispatch was auto-created from a Brick Loading
// trip — the separate brickCategories.quantity deduction that flow makes,
// un-linking that loading entry (dispatchId -> null) rather than leaving it
// dangling. The loading entry itself is never deleted; the physical
// loading trip is a real, separate record. Also deletes every Challan/
// Gate Pass/Invoice/Expense generated FROM this dispatch (see below) —
// nothing about this dispatch is left behind anywhere in the system.
export async function deleteDispatch(kilnId: string, dispatchId: string) {
  const existing = (await db.select().from(dispatches).where(and(eq(dispatches._id, dispatchId), eq(dispatches.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Dispatch not found in this kiln");

  // recordDeliveryAdjustment already posted its own partial reversal for
  // any bricks returned — reverse only what's still outstanding from this
  // dispatch, not the original gross figures again.
  const returnedCount = existing.returnedCount ?? 0;
  const unitPrice = existing.bricksCount > 0 ? existing.amount / existing.bricksCount : 0;
  const alreadyRefunded = Math.round(unitPrice * returnedCount);
  const remainingNetAmount = Math.round((existing.amount - alreadyRefunded) * 100) / 100;
  const remainingBricksOut = existing.bricksCount - returnedCount;

  if (existing.customerId && remainingNetAmount !== 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.customerId,
      direction: "PAID",
      amount: remainingNetAmount,
      reason: `Dispatch ${existing.slipNumber} deleted — reversing ₹${remainingNetAmount.toLocaleString("en-IN")}`,
    });
  }

  if (remainingBricksOut !== 0) {
    const grade = (existing.grade ?? "A1") as BrickGrade;
    await recordStockEntry({ kilnId, seasonId: existing.seasonId!, type: "FINISHED_GOODS", itemName: GRADE_STOCK_ITEM[grade], quantity: remainingBricksOut });
  }

  const linkedEntry = (await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries.dispatchId, dispatchId), eq(brickLoadingEntries.kilnId, kilnId))))[0];
  if (linkedEntry) {
    // Restore by the DISPATCH's own current items/categoryId/bricksCount,
    // not the loading entry's — updateDispatch above only ever corrects
    // brickCategories.quantity against the dispatch's own fields (it never
    // touches brickLoadingEntries), so those are what the stock was actually
    // last deducted against if this dispatch was edited after creation.
    // Using the loading entry's original (possibly stale) values here would
    // restore the wrong category and/or the wrong quantity. One restore per
    // category line item, not just the aggregate.
    for (const item of itemsOrLegacyFallback(existing)) {
      if (!item.categoryId) continue;
      await db.update(brickCategories).set({ quantity: sql`${brickCategories.quantity} + ${item.bricksCount}` }).where(eq(brickCategories._id, item.categoryId));
      emitToKiln(kilnId, "brickCategory:update", (await db.select().from(brickCategories).where(eq(brickCategories._id, item.categoryId)))[0]);
    }
    await db.update(brickLoadingEntries).set({ dispatchId: null }).where(eq(brickLoadingEntries._id, linkedEntry._id));
    emitToKiln(kilnId, "brickLoading:update", (await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, linkedEntry._id)))[0]);
  }

  // Every Challan/Gate Pass/Invoice/Expense generated FROM this dispatch is
  // meaningless once it's gone — delete them too rather than leaving them
  // orphaned (pointing at a dispatchId that no longer exists). Invoices
  // don't post to the ledger or any stock table (customer balance is
  // derived live from the invoices table itself, see customer.service.ts),
  // and Challan/Gate Pass are plain documents with no side effects of their
  // own, so a plain delete + the same "{_id, deleted:true}" socket event
  // their own dedicated delete functions already emit is enough — inlined
  // here (not calling deleteChallan/deleteGatePass/deleteInvoice directly)
  // since dispatchDocuments.service.ts already imports from this file,
  // and importing back would create a circular dependency.
  const [linkedChallans, linkedGatePasses, linkedInvoices, linkedExpenses] = await Promise.all([
    db.select({ _id: challans._id }).from(challans).where(and(eq(challans.dispatchId, dispatchId), eq(challans.kilnId, kilnId))),
    db.select({ _id: gatePasses._id }).from(gatePasses).where(and(eq(gatePasses.dispatchId, dispatchId), eq(gatePasses.kilnId, kilnId))),
    db.select({ _id: invoices._id }).from(invoices).where(and(eq(invoices.dispatchId, dispatchId), eq(invoices.kilnId, kilnId))),
    db.select({ _id: expenses._id }).from(expenses).where(and(eq(expenses.dispatchId, dispatchId), eq(expenses.kilnId, kilnId))),
  ]);
  for (const row of linkedChallans) {
    await db.delete(challans).where(eq(challans._id, row._id));
    emitToKiln(kilnId, "challan:update", { _id: row._id, deleted: true });
  }
  for (const row of linkedGatePasses) {
    await db.delete(gatePasses).where(eq(gatePasses._id, row._id));
    emitToKiln(kilnId, "gatePass:update", { _id: row._id, deleted: true });
  }
  for (const row of linkedInvoices) {
    await db.delete(invoices).where(eq(invoices._id, row._id));
    emitToKiln(kilnId, "invoice:update", { _id: row._id, deleted: true });
  }
  for (const row of linkedExpenses) {
    await db.delete(expenses).where(eq(expenses._id, row._id));
    emitToKiln(kilnId, "expense:update", { _id: row._id, deleted: true });
  }

  await db.delete(dispatches).where(eq(dispatches._id, dispatchId));
  emitToKiln(kilnId, "dispatch:update", { _id: dispatchId, deleted: true });
}

// `days` is optional and unbounded (all-time) when omitted — mirrors
// listBrickLoadingEntries's own "only filter if a window was actually
// requested" pattern. Previously defaulted to 30, which silently hid any
// dispatch (including a Brick-Loading-linked one) older than a month from
// the Dispatch/Billing/Gate-Pass pages, even though it was fully visible
// and correctly linked on the Brick Loading page the whole time.
export async function listDispatches(kilnId: string, seasonId: string, days?: number) {
  const conditions = [eq(dispatches.kilnId, kilnId), eq(dispatches.seasonId, seasonId)];
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    conditions.push(gte(dispatches.dispatchedOn, since));
  }
  const rows = await db.select().from(dispatches).where(and(...conditions)).orderBy(desc(dispatches.dispatchedOn));

  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((v): v is string => !!v))];
  const customerIds = [...new Set(rows.map((r) => r.customerId).filter((v): v is string => !!v))];
  const ids = [...new Set([...driverIds, ...customerIds])];
  // phone/address/gstNumber included so print templates (Gate Pass/Challan)
  // can show client address/GSTIN and driver mobile without a second round trip.
  const peopleRows = ids.length ? await db.select({ _id: people._id, name: people.name, phone: people.phone, address: people.address, gstNumber: people.gstNumber }).from(people).where(inArray(people._id, ids)) : [];
  const personById = new Map(peopleRows.map((p) => [p._id, p]));

  const categoryIds = [
    ...new Set([
      ...rows.map((r) => r.categoryId).filter((v): v is string => !!v),
      ...rows.flatMap((r) => (r.items ?? []).map((i) => i.categoryId).filter((v): v is string => !!v)),
    ]),
  ];
  const categoryRows = categoryIds.length
    ? await db.select({ _id: brickCategories._id, category: brickCategories.category, grade: brickCategories.grade }).from(brickCategories).where(inArray(brickCategories._id, categoryIds))
    : [];
  const categoryById = new Map(categoryRows.map((c) => [c._id, c]));

  return rows.map((r) => ({
    ...r,
    items: r.items?.map((i) => ({ ...i, categoryId: i.categoryId ? categoryById.get(i.categoryId) ?? i.categoryId : i.categoryId })),
    driverId: r.driverId ? personById.get(r.driverId) ?? r.driverId : r.driverId,
    customerId: r.customerId ? personById.get(r.customerId) ?? r.customerId : r.customerId,
    categoryId: r.categoryId ? categoryById.get(r.categoryId) ?? r.categoryId : r.categoryId,
  }));
}

// Every dispatch ever billed to one customer, oldest first — no day
// window, unlike listDispatches — used by the Reports page's full-history
// view. Duplicates listDispatches's populate shape rather than factoring
// it out, so a future change to one doesn't risk silently changing the
// other's behavior too.
export async function listDispatchesForCustomer(kilnId: string, customerId: string) {
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), eq(dispatches.customerId, customerId))).orderBy(desc(dispatches.dispatchedOn));

  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((v): v is string => !!v))];
  const driverRows = driverIds.length ? await db.select({ _id: people._id, name: people.name, phone: people.phone }).from(people).where(inArray(people._id, driverIds)) : [];
  const driverById = new Map(driverRows.map((p) => [p._id, p]));

  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))];
  const categoryRows = categoryIds.length
    ? await db.select({ _id: brickCategories._id, category: brickCategories.category, grade: brickCategories.grade }).from(brickCategories).where(inArray(brickCategories._id, categoryIds))
    : [];
  const categoryById = new Map(categoryRows.map((c) => [c._id, c]));

  return rows.map((r) => ({
    ...r,
    driverId: r.driverId ? driverById.get(r.driverId) ?? r.driverId : r.driverId,
    categoryId: r.categoryId ? categoryById.get(r.categoryId) ?? r.categoryId : r.categoryId,
  }));
}

// seasonIds, not a single seasonId — callers doing a "state of the world
// right now" reconciliation check (see reconciliation.service.ts) pass
// every season up to and including the current one (seasonIdsThrough), so
// this sums across the whole cumulative history rather than one season's
// slice, matching brickCategories.quantity's own always-cumulative meaning.
export async function totalDispatchedSince(kilnId: string, seasonIds: string[], since: Date) {
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), inArray(dispatches.seasonId, seasonIds), gte(dispatches.dispatchedOn, since)));
  return rows.reduce((sum, d) => sum + d.bricksCount, 0);
}

export async function dispatchTotals(kilnId: string, seasonId: string, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), eq(dispatches.seasonId, seasonId), gte(dispatches.dispatchedOn, since)));

  return {
    days,
    bricksCount: rows.reduce((sum, d) => sum + d.bricksCount, 0),
    amount: rows.reduce((sum, d) => sum + d.amount, 0),
    dispatchCount: rows.length,
  };
}

// Cumulative across every season through the current one (seasonIdsThrough
// — same convention as totalDispatchedSince/brickCategories.quantity, an
// always-cumulative running total, not a time-boxed window), grouped by
// brick category — the Overview page's "Bricks Sold by Category" panel,
// mirroring "Bricks by category" (live stock) with the same all-time
// scope. Prefers the per-line-item breakdown (items[]) for a multi-
// category dispatch; falls back to the scalar categoryId/bricksCount pair
// for older rows created before items[] existed.
export async function bricksSoldByCategory(kilnId: string, seasonIds: string[]) {
  const rows = await db
    .select({ categoryId: dispatches.categoryId, bricksCount: dispatches.bricksCount, items: dispatches.items })
    .from(dispatches)
    .where(and(eq(dispatches.kilnId, kilnId), inArray(dispatches.seasonId, seasonIds)));

  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.items && r.items.length > 0) {
      for (const item of r.items) {
        if (!item.categoryId) continue;
        totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + item.bricksCount);
      }
    } else if (r.categoryId) {
      totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.bricksCount);
    }
  }

  const categoryIds = [...totals.keys()];
  const categoryRows = categoryIds.length
    ? await db
        .select({ _id: brickCategories._id, category: brickCategories.category, grade: brickCategories.grade })
        .from(brickCategories)
        .where(inArray(brickCategories._id, categoryIds))
    : [];

  return categoryRows
    .map((c) => ({ categoryId: c._id, category: c.category, grade: c.grade, bricksSold: totals.get(c._id) ?? 0 }))
    .sort((a, b) => b.bricksSold - a.bricksSold);
}

// Separate from dispatchTotals — that one's `days` is always relative to
// now, which isn't what a season-year comparison needs (an absolute,
// possibly-past window). Same shape otherwise.
export async function dispatchTotalsForRange(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), gte(dispatches.dispatchedOn, from), lte(dispatches.dispatchedOn, to)));
  return {
    bricksCount: rows.reduce((sum, d) => sum + d.bricksCount, 0),
    amount: rows.reduce((sum, d) => sum + d.amount, 0),
    dispatchCount: rows.length,
  };
}
