import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { challans, gatePasses, invoices, dispatches, people, DISPATCH_PAYMENT_MODES } from "../db/schema";
import type { BrickLineItem } from "../db/schema/_helpers";
import { isDuplicateEntryError, kilnPrefix } from "./dispatch.service";
import { summarizeItems } from "./brickLineItems.util";
import { addLedgerEntry, type LedgerCategory } from "./ledger.service";
import { emitToKiln } from "../config/socket";

type PaymentMode = (typeof DISPATCH_PAYMENT_MODES)[number];

// The pending balance a PARTNER-attributed invoice hands off to that
// partner (the kiln looks to the partner to recover it, not the
// customer) — same "unset amountPaidNow = fully paid" convention as
// getCustomerDetail.
function partnerPendingAmount(netAmount: number, amountPaidNow?: number | null): number {
  const paid = amountPaidNow ?? netAmount;
  return Math.max(0, Math.round((netAmount - paid) * 100) / 100);
}

// What a SALES_AGENT earns on one invoice, per that agent's own commission
// basis (see people.commissionType) — 0 for an unset/deleted agent, same
// as the rest of this app's "no rate set = nothing computed" convention.
async function agentCommissionAmount(kilnId: string, agentId: string | null | undefined, netAmount: number, bricksCount: number): Promise<number> {
  if (!agentId) return 0;
  const agent = (await db.select().from(people).where(and(eq(people._id, agentId), eq(people.kilnId, kilnId))))[0];
  if (!agent) return 0;
  if (agent.commissionType === "PERCENT_OF_SALE") {
    return Math.round(netAmount * ((agent.commissionPercent ?? 0) / 100) * 100) / 100;
  }
  if (agent.commissionType === "PER_THOUSAND_BRICKS") {
    return Math.round((bricksCount / 1000) * (agent.commissionPerThousand ?? 0) * 100) / 100;
  }
  return 0;
}

// Keeps one attributed person's ledger (partner liability or agent
// commission) in sync with an invoice's current state — handles all three
// shapes with the same delta-correction convention used everywhere else in
// this file (updateFuelPurchase, updatePaymentReceipt, ...): unattributed
// -> attributed (post in full), attributed -> unattributed or reattributed
// to someone else (reverse the old person's amount in full, post the new
// one in full), same person with a changed amount (post just the delta).
async function syncAttributionLedger(
  kilnId: string,
  category: LedgerCategory,
  reason: string,
  date: Date | undefined,
  oldPersonId: string | null | undefined,
  oldAmount: number,
  newPersonId: string | null | undefined,
  newAmount: number
) {
  const oldId = oldPersonId ?? null;
  const newId = newPersonId ?? null;

  if (oldId === newId) {
    if (!oldId) return;
    const delta = Math.round((newAmount - oldAmount) * 100) / 100;
    if (delta === 0) return;
    await addLedgerEntry({
      kilnId,
      personId: oldId,
      direction: delta > 0 ? "DUE" : "PAID",
      amount: Math.abs(delta),
      reason: `${reason} (correction)`,
      category,
      date,
    });
    return;
  }

  if (oldId && oldAmount > 0) {
    await addLedgerEntry({ kilnId, personId: oldId, direction: "PAID", amount: oldAmount, reason: `${reason} (reversed — reattributed)`, category, date });
  }
  if (newId && newAmount > 0) {
    await addLedgerEntry({ kilnId, personId: newId, direction: "DUE", amount: newAmount, reason, category, date });
  }
}

// MAX-based, not COUNT-based — see brickLoading.service.ts's
// generateTripNumber for the exact collision-after-delete bug this avoids.
// MAX() ignores NULL rows, so a challan/gate pass/invoice saved with its
// serial number left blank never advances this — the same suggested number
// comes back next time, exactly as requested. Scoped to the season so
// numbering resets to 1 each new Bhatta Season.
async function generateSequenceNumber(table: typeof challans | typeof gatePasses | typeof invoices, kilnId: string, seasonId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${table.sequenceNumber})` }).from(table).where(and(eq(table.kilnId, kilnId), eq(table.seasonId, seasonId))))[0];
  return (maxRow?.max ?? 0) + 1;
}

// "Peek" the next available number without consuming it — used by the
// Create form to pre-fill the Serial Number field before the admin has
// saved anything.
export async function nextChallanSequenceNumber(kilnId: string, seasonId: string) {
  return generateSequenceNumber(challans, kilnId, seasonId);
}
export async function nextGatePassSequenceNumber(kilnId: string, seasonId: string) {
  return generateSequenceNumber(gatePasses, kilnId, seasonId);
}
export async function nextInvoiceSequenceNumber(kilnId: string, seasonId: string) {
  return generateSequenceNumber(invoices, kilnId, seasonId);
}

// The same "what number does this invoice go by" formula the frontend's
// formatInvoiceNumber (printDocument.ts) uses — kept in sync deliberately,
// same short pure rule either side — so any backend-generated view of an
// invoice's serial (reports, exports) matches what's on the printout
// instead of showing the older, non-session INV-{sequenceNumber} counter.
export function formatInvoiceNumber(invoice: { session: string | null; sessionSerialNumber: number | null; sequenceNumber: number | null }, kilnName: string): string {
  return invoice.session && invoice.sessionSerialNumber != null
    ? `${kilnPrefix(kilnName)}/${invoice.session}/${invoice.sessionSerialNumber}`
    : `INV-${invoice.sequenceNumber ?? "—"}`;
}

async function assertDispatch(kilnId: string, dispatchId: string) {
  const dispatch = (await db.select().from(dispatches).where(and(eq(dispatches._id, dispatchId), eq(dispatches.kilnId, kilnId))))[0];
  if (!dispatch) throw new Error("Dispatch not found in this kiln");
  return dispatch;
}

// ---- Challan (delivery note, no pricing) ----

export interface ChallanInput {
  dispatchId: string;
  // Admin-editable on the Create form (pre-filled with the next suggested
  // number, but the admin can clear it — omitted/undefined here means
  // "leave blank", stored as NULL, never auto-substituted).
  sequenceNumber?: number;
  vehicleNumber?: string;
  vehicleType?: string;
  driverName?: string;
  driverPhone?: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  categoryId?: string;
  bricksCount: number;
  // Multi-category breakdown (no pricing here, same as bricksCount above)
  // — see BrickLineItem's doc comment in db/schema/_helpers.ts. When
  // given, categoryId/bricksCount above are overridden with the aggregate.
  items?: BrickLineItem[];
  placeOfSupply?: string;
  challanDate?: Date;
  notes?: string;
}

function applyItemsAggregate<T extends { items?: BrickLineItem[]; categoryId?: string; bricksCount?: number }>(input: T): T {
  if (!input.items || input.items.length === 0) return input;
  const summary = summarizeItems(input.items);
  return { ...input, items: summary.items, categoryId: summary.categoryId, bricksCount: summary.bricksCount };
}

export async function createChallan(kilnId: string, seasonId: string, rawInput: ChallanInput) {
  await assertDispatch(kilnId, rawInput.dispatchId);
  const input = applyItemsAggregate(rawInput);
  const _id = randomUUID();
  try {
    await db.insert(challans).values({ ...input, sequenceNumber: input.sequenceNumber ?? null, _id, kilnId, seasonId });
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const row = (await db.select().from(challans).where(eq(challans._id, _id)))[0]!;
  emitToKiln(kilnId, "challan:update", row);
  return row;
}

export interface ListChallansFilter {
  dispatchId?: string;
  from?: Date;
  to?: Date;
  // Excluded by default — a cancelled challan carries no pricing so it
  // never affected a total, but staying out of the default list keeps
  // every existing caller (dispatch-linked lookups, exports) correct
  // without having to know cancelled challans exist at all. The Challan
  // list PAGE explicitly opts in with true, since the client wants a
  // cancelled document to stay visible there with a muted badge, not
  // disappear the way a deleted one used to.
  includeCancelled?: boolean;
}

// seasonId is nullable — pass null for an all-time, every-season view
// (Reports' date-range queries).
export async function listChallans(kilnId: string, seasonId: string | null, filter: string | ListChallansFilter = {}) {
  const f: ListChallansFilter = typeof filter === "string" ? { dispatchId: filter } : filter;
  const conditions = [eq(challans.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(challans.seasonId, seasonId));
  if (f.dispatchId) conditions.push(eq(challans.dispatchId, f.dispatchId));
  if (f.from) conditions.push(gte(challans.challanDate, f.from));
  if (f.to) conditions.push(lte(challans.challanDate, f.to));
  if (!f.includeCancelled) conditions.push(eq(challans.cancelled, false));
  return db.select().from(challans).where(and(...conditions)).orderBy(desc(challans.createdAt));
}

export async function updateChallan(kilnId: string, id: string, rawInput: Partial<Omit<ChallanInput, "dispatchId">>) {
  const existing = (await db.select().from(challans).where(and(eq(challans._id, id), eq(challans.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Challan not found in this kiln");
  const input = applyItemsAggregate(rawInput);
  try {
    await db.update(challans).set(input).where(eq(challans._id, id));
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const updated = (await db.select().from(challans).where(eq(challans._id, id)))[0]!;
  emitToKiln(kilnId, "challan:update", updated);
  return updated;
}

// Closes the gap a cancelled Gate Pass/Challan leaves behind — every later
// document in the same kiln+season shifts down by one, in ascending order
// so each UPDATE only ever targets a number the previous step (or the
// cancelled row's own number, about to be nulled by the caller) just
// freed, never a number still held by another row. A row whose own
// sequenceNumber is already NULL (an earlier cancel) is automatically
// skipped by the `gt` comparison, so this is safe to call repeatedly.
// Invoice has its own equivalent, closeInvoiceSessionGap below, since it's
// numbered via session+sessionSerialNumber rather than this plain
// per-kiln-per-season sequenceNumber.
async function closeSequenceGap(table: typeof challans | typeof gatePasses, kilnId: string, seasonId: string, cancelledNumber: number | null) {
  if (cancelledNumber == null) return;
  const later = await db
    .select({ _id: table._id, sequenceNumber: table.sequenceNumber })
    .from(table)
    .where(and(eq(table.kilnId, kilnId), eq(table.seasonId, seasonId), gt(table.sequenceNumber, cancelledNumber)))
    .orderBy(asc(table.sequenceNumber));
  for (const row of later) {
    await db.update(table).set({ sequenceNumber: row.sequenceNumber! - 1 }).where(eq(table._id, row._id));
  }
}

// No Challan is ever hard-deleted — this reverses nothing financial (a
// Challan carries no pricing) beyond closing the numbering gap it leaves:
// every later challan in the same kiln+season shifts down by one, and
// this challan's own number is cleared so nothing ever shows two
// documents with the same printed number, one cancelled or not. The row
// itself stays, marked cancelled, for audit history.
export async function cancelChallan(kilnId: string, id: string) {
  const existing = (await db.select().from(challans).where(and(eq(challans._id, id), eq(challans.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Challan not found in this kiln");
  if (existing.cancelled) throw new Error("Challan is already cancelled");
  await closeSequenceGap(challans, kilnId, existing.seasonId!, existing.sequenceNumber);
  await db.update(challans).set({ cancelled: true, cancelledAt: new Date(), sequenceNumber: null }).where(eq(challans._id, id));
  const updated = (await db.select().from(challans).where(eq(challans._id, id)))[0]!;
  emitToKiln(kilnId, "challan:update", updated);
}

// ---- Gate Pass (exit-authorization slip) ----

export interface GatePassInput {
  dispatchId: string;
  sequenceNumber?: number;
  vehicleNumber?: string;
  vehicleType?: string;
  driverName?: string;
  driverPhone?: string;
  customerName: string;
  categoryId?: string;
  bricksCount: number;
  // Multi-category breakdown (no pricing here, same as bricksCount above)
  // — see BrickLineItem's doc comment in db/schema/_helpers.ts. When
  // given, categoryId/bricksCount above are overridden with the aggregate.
  items?: BrickLineItem[];
  placeOfSupply?: string;
  gatePassDate?: Date;
  notes?: string;
}

export async function createGatePass(kilnId: string, seasonId: string, rawInput: GatePassInput) {
  await assertDispatch(kilnId, rawInput.dispatchId);
  const input = applyItemsAggregate(rawInput);
  const _id = randomUUID();
  try {
    await db.insert(gatePasses).values({ ...input, sequenceNumber: input.sequenceNumber ?? null, _id, kilnId, seasonId });
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const row = (await db.select().from(gatePasses).where(eq(gatePasses._id, _id)))[0]!;
  emitToKiln(kilnId, "gatePass:update", row);
  return row;
}

export interface ListGatePassesFilter {
  dispatchId?: string;
  from?: Date;
  to?: Date;
  // Excluded by default — see ListChallansFilter's own note on why (same
  // reasoning, Gate Pass carries no pricing either).
  includeCancelled?: boolean;
}

// seasonId is nullable — pass null for an all-time, every-season view
// (Reports' date-range queries).
export async function listGatePasses(kilnId: string, seasonId: string | null, filter: string | ListGatePassesFilter = {}) {
  const f: ListGatePassesFilter = typeof filter === "string" ? { dispatchId: filter } : filter;
  const conditions = [eq(gatePasses.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(gatePasses.seasonId, seasonId));
  if (f.dispatchId) conditions.push(eq(gatePasses.dispatchId, f.dispatchId));
  if (f.from) conditions.push(gte(gatePasses.gatePassDate, f.from));
  if (f.to) conditions.push(lte(gatePasses.gatePassDate, f.to));
  if (!f.includeCancelled) conditions.push(eq(gatePasses.cancelled, false));
  return db.select().from(gatePasses).where(and(...conditions)).orderBy(desc(gatePasses.createdAt));
}

export async function updateGatePass(kilnId: string, id: string, rawInput: Partial<Omit<GatePassInput, "dispatchId">>) {
  const existing = (await db.select().from(gatePasses).where(and(eq(gatePasses._id, id), eq(gatePasses.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Gate pass not found in this kiln");
  const input = applyItemsAggregate(rawInput);
  try {
    await db.update(gatePasses).set(input).where(eq(gatePasses._id, id));
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const updated = (await db.select().from(gatePasses).where(eq(gatePasses._id, id)))[0]!;
  emitToKiln(kilnId, "gatePass:update", updated);
  return updated;
}

// No Gate Pass is ever hard-deleted — same reasoning as cancelChallan
// above (no pricing to reverse, just close the numbering gap and mark it
// cancelled in place).
export async function cancelGatePass(kilnId: string, id: string) {
  const existing = (await db.select().from(gatePasses).where(and(eq(gatePasses._id, id), eq(gatePasses.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Gate pass not found in this kiln");
  if (existing.cancelled) throw new Error("Gate pass is already cancelled");
  await closeSequenceGap(gatePasses, kilnId, existing.seasonId!, existing.sequenceNumber);
  await db.update(gatePasses).set({ cancelled: true, cancelledAt: new Date(), sequenceNumber: null }).where(eq(gatePasses._id, id));
  const updated = (await db.select().from(gatePasses).where(eq(gatePasses._id, id)))[0]!;
  emitToKiln(kilnId, "gatePass:update", updated);
}

// ---- Invoice (priced, GST commercial bill) ----

export interface InvoiceInput {
  // Absent for an invoice created from a Customer's own profile page
  // (Add Amount, or a Customer-aware Create Invoice) rather than a
  // Dispatch's detail page.
  dispatchId?: string;
  sequenceNumber?: number;
  customerId?: string;
  // Sale attributed to a PARTNER and/or a SALES_AGENT — see
  // syncAttributionLedger's doc comment above for what each drives.
  // Nullable (not just optional) so an update can explicitly clear an
  // attribution, not just leave it unset.
  partnerId?: string | null;
  agentId?: string | null;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerGstNumber?: string;
  customerStateCode?: string;
  vehicleNumber?: string;
  // GST breakdown — print-only, see the schema comment on
  // invoices.gstRatePercent. Left undefined = no GST section printed.
  gstRatePercent?: number;
  gstType?: "CGST_SGST" | "IGST";
  termsAndConditions?: string;
  categoryId?: string;
  bricksCount: number;
  // Multi-category breakdown — see BrickLineItem's doc comment in
  // db/schema/_helpers.ts. When given, categoryId/bricksCount above are
  // overridden with the aggregate; ratePerBrick/grossAmount/netAmount
  // below stay whatever the client computed and sent (same trust model
  // this endpoint already used for the single-category case — the backend
  // has never independently recomputed those from bricksCount x rate).
  items?: BrickLineItem[];
  ratePerBrick?: number;
  grossAmount?: number;
  discountAmount?: number;
  netAmount: number;
  // How much of netAmount is being paid right now — defaults to netAmount
  // (fully paid) when omitted; see the schema comment on
  // invoices.amountPaidNow.
  amountPaidNow?: number;
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  placeOfSupply?: string;
  invoiceDate?: Date;
  notes?: string;
}

// Indian financial year, Apr 1 – Mar 31, e.g. Aug 2026 or Jan 2027 both
// give "26-27" — the {session} segment of the GST invoice number format
// ({kilnPrefix}/{session}/{sessionSerialNumber}, see createInvoice below).
// Deliberately independent of the admin-configured Bhatta Season (see
// db/schema/season.ts) — that's a brick-production-cycle concept the
// admin starts/ends on their own schedule, not the fixed calendar
// GST/accounting year.
export function financialYearSession(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1; // getMonth() is 0-based; 3 = April
  const shortStart = String(startYear).slice(-2);
  const shortEnd = String(startYear + 1).slice(-2);
  return `${shortStart}-${shortEnd}`;
}

export async function createInvoice(kilnId: string, seasonId: string, rawInput: InvoiceInput) {
  if (rawInput.dispatchId) await assertDispatch(kilnId, rawInput.dispatchId);
  const input = applyItemsAggregate(rawInput);
  const invoiceDate = input.invoiceDate ?? new Date();
  const session = financialYearSession(invoiceDate);
  // MAX-based, not COUNT-based — same collision-after-delete bug
  // generateSequenceNumber's own comment above warns about, and this had
  // it: COUNT(*) shrinks the moment any invoice in this session is
  // deleted, so the very next invoice created quietly reuses an already-
  // printed number instead of continuing past it. Confirmed against real
  // production data — one financial-year session had the same printed
  // serial (e.g. "JVS/26-27/36") on three different invoices while two
  // other numbers in the same range were never issued to anyone, the
  // exact gap-and-collision signature a COUNT-based counter produces.
  const sessionMaxRow = (
    await db.select({ max: sql<number | null>`max(${invoices.sessionSerialNumber})` }).from(invoices).where(and(eq(invoices.kilnId, kilnId), eq(invoices.session, session)))
  )[0];
  const sessionSerialNumber = (sessionMaxRow?.max ?? 0) + 1;

  const _id = randomUUID();
  try {
    await db.insert(invoices).values({ ...input, invoiceDate, session, sessionSerialNumber, sequenceNumber: input.sequenceNumber ?? null, _id, kilnId, seasonId });
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const row = (await db.select().from(invoices).where(eq(invoices._id, _id)))[0]!;

  if (input.partnerId) {
    const pending = partnerPendingAmount(row.netAmount, row.amountPaidNow);
    if (pending > 0) {
      await addLedgerEntry({
        kilnId,
        personId: input.partnerId,
        direction: "DUE",
        amount: pending,
        reason: `Pending customer due on sale to ${row.customerName}${row.sequenceNumber != null ? ` (Invoice ${row.sequenceNumber})` : ""}`,
        category: "PARTNER_DUE",
        date: invoiceDate,
      });
    }
  }
  if (input.agentId) {
    const commission = await agentCommissionAmount(kilnId, input.agentId, row.netAmount, row.bricksCount);
    if (commission > 0) {
      await addLedgerEntry({
        kilnId,
        personId: input.agentId,
        direction: "DUE",
        amount: commission,
        reason: `Commission: sale to ${row.customerName}${row.sequenceNumber != null ? ` (Invoice ${row.sequenceNumber})` : ""}`,
        category: "COMMISSION",
        date: invoiceDate,
      });
    }
  }

  emitToKiln(kilnId, "invoice:update", row);
  return row;
}

export interface ListInvoicesFilter {
  dispatchId?: string;
  customerId?: string;
  partnerId?: string;
  agentId?: string;
  from?: Date;
  to?: Date;
  // Excluded by default — a cancelled invoice must not count toward any
  // revenue/due/balance total (that's the entire point of cancel-not-
  // delete: "amounts refresh exactly as they would when deleted"), and
  // this function is the one almost every report/balance calculation
  // routes through. The Invoices list PAGE explicitly opts in with true,
  // since the client wants a cancelled invoice to stay visible there with
  // a muted badge, not vanish the way a deleted one used to.
  includeCancelled?: boolean;
}

// seasonId is nullable — pass null for an all-time, every-season view
// (Reports' date-range queries).
export async function listInvoices(kilnId: string, seasonId: string | null, filter: string | ListInvoicesFilter = {}) {
  const f: ListInvoicesFilter = typeof filter === "string" ? { dispatchId: filter } : filter;
  const conditions = [eq(invoices.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(invoices.seasonId, seasonId));
  if (f.dispatchId) conditions.push(eq(invoices.dispatchId, f.dispatchId));
  if (f.customerId) conditions.push(eq(invoices.customerId, f.customerId));
  if (f.partnerId) conditions.push(eq(invoices.partnerId, f.partnerId));
  if (f.agentId) conditions.push(eq(invoices.agentId, f.agentId));
  if (f.from) conditions.push(gte(invoices.invoiceDate, f.from));
  if (f.to) conditions.push(lte(invoices.invoiceDate, f.to));
  if (!f.includeCancelled) conditions.push(eq(invoices.cancelled, false));
  // Newest-first by the invoice's own printed serial (session, then
  // sessionSerialNumber within it) — not createdAt. createdAt is when the
  // DB row was inserted, which drifts from serial order the moment any
  // invoice is backdated, edited, or re-entered after the fact (this
  // session alone created two invoices today dated back in August) —
  // sorting by it made the Invoices page's list bounce around in an order
  // that had nothing to do with the printed JVS/{session}/{N} numbers
  // sitting right next to it. invoiceDate/createdAt stay as the final
  // tiebreaker for older rows with no session (pre-dates the session
  // feature) — NULLs sort last in a DESC order, so those legitimately
  // older rows still land at the bottom of a newest-first list.
  return db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.session), desc(invoices.sessionSerialNumber), desc(invoices.invoiceDate), desc(invoices.createdAt));
}

// Every invoice "generated under this customer's name" — matched by
// customerId when the invoice was created from the Customer's own
// profile page, OR by an exact (case-insensitive) customerName match for
// older/Dispatch-created invoices that never had a customerId to begin
// with. See the schema comment on invoices.customerId for why both are
// checked instead of just one.
// seasonIds is the cumulative-through-season set (see season.util.ts's
// seasonIdsThrough) — a customer's balance always includes every season up
// to and including the one being viewed, never just one season in
// isolation (same "carries forward" principle as openingPaid/openingDue).
// Always excludes cancelled invoices, no opt-in — this is the query
// getCustomerDetail's live balance sums over, so leaving a cancelled one
// in would re-inflate the exact balance cancel is supposed to correct.
export async function listInvoicesForCustomer(kilnId: string, customerId: string, customerName: string, seasonIds: string[]) {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.kilnId, kilnId),
        inArray(invoices.seasonId, seasonIds),
        eq(invoices.cancelled, false),
        or(eq(invoices.customerId, customerId), and(isNull(invoices.customerId), eq(sql`lower(${invoices.customerName})`, customerName.toLowerCase())))
      )
    )
    .orderBy(desc(invoices.createdAt));
  return rows;
}

export async function updateInvoice(kilnId: string, id: string, rawInput: Partial<Omit<InvoiceInput, "dispatchId">>) {
  const existing = (await db.select().from(invoices).where(and(eq(invoices._id, id), eq(invoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Invoice not found in this kiln");
  const input = applyItemsAggregate(rawInput);
  try {
    await db.update(invoices).set(input).where(eq(invoices._id, id));
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const updated = (await db.select().from(invoices).where(eq(invoices._id, id)))[0]!;

  // Only re-sync partner/agent ledgers when something that actually
  // changes the posted amount was touched — avoids a no-op correction
  // entry on every unrelated edit (e.g. just fixing a phone number).
  if (input.partnerId !== undefined || input.netAmount !== undefined || input.amountPaidNow !== undefined) {
    const oldPending = partnerPendingAmount(existing.netAmount, existing.amountPaidNow);
    const newPending = partnerPendingAmount(updated.netAmount, updated.amountPaidNow);
    await syncAttributionLedger(
      kilnId,
      "PARTNER_DUE",
      `Pending customer due on sale to ${updated.customerName}${updated.sequenceNumber != null ? ` (Invoice ${updated.sequenceNumber})` : ""}`,
      updated.invoiceDate ?? undefined,
      existing.partnerId,
      existing.partnerId ? oldPending : 0,
      updated.partnerId,
      updated.partnerId ? newPending : 0
    );
  }
  if (input.agentId !== undefined || input.netAmount !== undefined || input.items !== undefined || input.bricksCount !== undefined) {
    const oldCommission = await agentCommissionAmount(kilnId, existing.agentId, existing.netAmount, existing.bricksCount);
    const newCommission = await agentCommissionAmount(kilnId, updated.agentId, updated.netAmount, updated.bricksCount);
    await syncAttributionLedger(
      kilnId,
      "COMMISSION",
      `Commission: sale to ${updated.customerName}${updated.sequenceNumber != null ? ` (Invoice ${updated.sequenceNumber})` : ""}`,
      updated.invoiceDate ?? undefined,
      existing.agentId,
      oldCommission,
      updated.agentId,
      newCommission
    );
  }

  emitToKiln(kilnId, "invoice:update", updated);
  return updated;
}

// No Invoice is ever hard-deleted — "Delete" cancels it: reverses the
// partner/agent ledger entries exactly as before, closes the numbering
// gap and clears this invoice's own printed number (same renumber-on-
// cancel behavior the client asked to extend from Gate Pass/Challan to
// Invoice too), but leaves the row itself in place, marked cancelled.
// The customer's own balance never needed a separate reversal here — it's
// always live-recomputed from currently-non-cancelled invoices
// (getCustomerDetail/listInvoicesForCustomer), so excluding this row from
// that query IS the balance reversal.
export async function cancelInvoice(kilnId: string, id: string) {
  const existing = (await db.select().from(invoices).where(and(eq(invoices._id, id), eq(invoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Invoice not found in this kiln");
  if (existing.cancelled) throw new Error("Invoice is already cancelled");

  if (existing.partnerId) {
    const pending = partnerPendingAmount(existing.netAmount, existing.amountPaidNow);
    if (pending > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.partnerId,
        direction: "PAID",
        amount: pending,
        reason: `Invoice cancelled — reversing pending due on sale to ${existing.customerName}`,
        category: "PARTNER_DUE",
      });
    }
  }
  if (existing.agentId) {
    const commission = await agentCommissionAmount(kilnId, existing.agentId, existing.netAmount, existing.bricksCount);
    if (commission > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.agentId,
        direction: "PAID",
        amount: commission,
        reason: `Invoice cancelled — reversing commission on sale to ${existing.customerName}`,
        category: "COMMISSION",
      });
    }
  }

  await closeInvoiceSessionGap(kilnId, existing.session, existing.sessionSerialNumber);
  await db.update(invoices).set({ cancelled: true, cancelledAt: new Date(), sessionSerialNumber: null }).where(eq(invoices._id, id));
  const updated = (await db.select().from(invoices).where(eq(invoices._id, id)))[0]!;
  emitToKiln(kilnId, "invoice:update", updated);
}

// Invoice's own equivalent of closeSequenceGap above, scoped by
// (kilnId, session) instead of (kilnId, seasonId) since sessionSerialNumber
// — not the older sequenceNumber field — is the one actually printed as
// JVS/{session}/{N} and shown everywhere in the UI. A row whose own
// sessionSerialNumber is already NULL (an earlier cancel) is
// automatically skipped by the `gt` comparison below, so this is safe to
// call repeatedly.
export async function closeInvoiceSessionGap(kilnId: string, session: string | null, cancelledNumber: number | null) {
  if (session == null || cancelledNumber == null) return;
  const later = await db
    .select({ _id: invoices._id, sessionSerialNumber: invoices.sessionSerialNumber })
    .from(invoices)
    .where(and(eq(invoices.kilnId, kilnId), eq(invoices.session, session), gt(invoices.sessionSerialNumber, cancelledNumber)))
    .orderBy(asc(invoices.sessionSerialNumber));
  for (const row of later) {
    await db.update(invoices).set({ sessionSerialNumber: row.sessionSerialNumber! - 1 }).where(eq(invoices._id, row._id));
  }
}
