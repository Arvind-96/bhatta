import { randomUUID } from "crypto";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { challans, gatePasses, invoices, dispatches, DISPATCH_PAYMENT_MODES } from "../db/schema";
import type { BrickLineItem } from "../db/schema/_helpers";
import { isDuplicateEntryError } from "./dispatch.service";
import { summarizeItems } from "./brickLineItems.util";
import { emitToKiln } from "../config/socket";

type PaymentMode = (typeof DISPATCH_PAYMENT_MODES)[number];

// MAX-based, not COUNT-based — see brickLoading.service.ts's
// generateTripNumber for the exact collision-after-delete bug this avoids.
// MAX() ignores NULL rows, so a challan/gate pass/invoice saved with its
// serial number left blank never advances this — the same suggested number
// comes back next time, exactly as requested.
async function generateSequenceNumber(table: typeof challans | typeof gatePasses | typeof invoices, kilnId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${table.sequenceNumber})` }).from(table).where(eq(table.kilnId, kilnId)))[0];
  return (maxRow?.max ?? 0) + 1;
}

// "Peek" the next available number without consuming it — used by the
// Create form to pre-fill the Serial Number field before the admin has
// saved anything.
export async function nextChallanSequenceNumber(kilnId: string) {
  return generateSequenceNumber(challans, kilnId);
}
export async function nextGatePassSequenceNumber(kilnId: string) {
  return generateSequenceNumber(gatePasses, kilnId);
}
export async function nextInvoiceSequenceNumber(kilnId: string) {
  return generateSequenceNumber(invoices, kilnId);
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

export async function createChallan(kilnId: string, rawInput: ChallanInput) {
  await assertDispatch(kilnId, rawInput.dispatchId);
  const input = applyItemsAggregate(rawInput);
  const _id = randomUUID();
  try {
    await db.insert(challans).values({ ...input, sequenceNumber: input.sequenceNumber ?? null, _id, kilnId });
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
}

export async function listChallans(kilnId: string, filter: string | ListChallansFilter = {}) {
  const f: ListChallansFilter = typeof filter === "string" ? { dispatchId: filter } : filter;
  const conditions = [eq(challans.kilnId, kilnId)];
  if (f.dispatchId) conditions.push(eq(challans.dispatchId, f.dispatchId));
  if (f.from) conditions.push(gte(challans.challanDate, f.from));
  if (f.to) conditions.push(lte(challans.challanDate, f.to));
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

export async function deleteChallan(kilnId: string, id: string) {
  const existing = (await db.select().from(challans).where(and(eq(challans._id, id), eq(challans.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Challan not found in this kiln");
  await db.delete(challans).where(eq(challans._id, id));
  emitToKiln(kilnId, "challan:update", { _id: id, deleted: true });
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

export async function createGatePass(kilnId: string, rawInput: GatePassInput) {
  await assertDispatch(kilnId, rawInput.dispatchId);
  const input = applyItemsAggregate(rawInput);
  const _id = randomUUID();
  try {
    await db.insert(gatePasses).values({ ...input, sequenceNumber: input.sequenceNumber ?? null, _id, kilnId });
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
}

export async function listGatePasses(kilnId: string, filter: string | ListGatePassesFilter = {}) {
  const f: ListGatePassesFilter = typeof filter === "string" ? { dispatchId: filter } : filter;
  const conditions = [eq(gatePasses.kilnId, kilnId)];
  if (f.dispatchId) conditions.push(eq(gatePasses.dispatchId, f.dispatchId));
  if (f.from) conditions.push(gte(gatePasses.gatePassDate, f.from));
  if (f.to) conditions.push(lte(gatePasses.gatePassDate, f.to));
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

export async function deleteGatePass(kilnId: string, id: string) {
  const existing = (await db.select().from(gatePasses).where(and(eq(gatePasses._id, id), eq(gatePasses.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Gate pass not found in this kiln");
  await db.delete(gatePasses).where(eq(gatePasses._id, id));
  emitToKiln(kilnId, "gatePass:update", { _id: id, deleted: true });
}

// ---- Invoice (priced, GST commercial bill) ----

export interface InvoiceInput {
  // Absent for an invoice created from a Customer's own profile page
  // (Add Amount, or a Customer-aware Create Invoice) rather than a
  // Dispatch's detail page.
  dispatchId?: string;
  sequenceNumber?: number;
  customerId?: string;
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
// Deliberately independent of the kiln's own configurable bhatta season
// (kilns.seasonStartMonth/Day, e.g. Aug 1 by default) — that's a
// brick-production-cycle concept used for season-scoped reporting, not
// the fixed calendar GST/accounting year.
function financialYearSession(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1; // getMonth() is 0-based; 3 = April
  const shortStart = String(startYear).slice(-2);
  const shortEnd = String(startYear + 1).slice(-2);
  return `${shortStart}-${shortEnd}`;
}

export async function createInvoice(kilnId: string, rawInput: InvoiceInput) {
  if (rawInput.dispatchId) await assertDispatch(kilnId, rawInput.dispatchId);
  const input = applyItemsAggregate(rawInput);
  const invoiceDate = input.invoiceDate ?? new Date();
  const session = financialYearSession(invoiceDate);
  const sameSessionCount = (
    await db.select({ count: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.kilnId, kilnId), eq(invoices.session, session)))
  )[0]?.count ?? 0;
  const sessionSerialNumber = sameSessionCount + 1;

  const _id = randomUUID();
  try {
    await db.insert(invoices).values({ ...input, invoiceDate, session, sessionSerialNumber, sequenceNumber: input.sequenceNumber ?? null, _id, kilnId });
  } catch (err) {
    if (isDuplicateEntryError(err)) throw new Error(`Serial number ${input.sequenceNumber} is already in use in this kiln — refresh and try again.`);
    throw err;
  }
  const row = (await db.select().from(invoices).where(eq(invoices._id, _id)))[0]!;
  emitToKiln(kilnId, "invoice:update", row);
  return row;
}

export interface ListInvoicesFilter {
  dispatchId?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
}

export async function listInvoices(kilnId: string, filter: string | ListInvoicesFilter = {}) {
  const f: ListInvoicesFilter = typeof filter === "string" ? { dispatchId: filter } : filter;
  const conditions = [eq(invoices.kilnId, kilnId)];
  if (f.dispatchId) conditions.push(eq(invoices.dispatchId, f.dispatchId));
  if (f.customerId) conditions.push(eq(invoices.customerId, f.customerId));
  if (f.from) conditions.push(gte(invoices.invoiceDate, f.from));
  if (f.to) conditions.push(lte(invoices.invoiceDate, f.to));
  return db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.createdAt));
}

// Every invoice "generated under this customer's name" — matched by
// customerId when the invoice was created from the Customer's own
// profile page, OR by an exact (case-insensitive) customerName match for
// older/Dispatch-created invoices that never had a customerId to begin
// with. See the schema comment on invoices.customerId for why both are
// checked instead of just one.
export async function listInvoicesForCustomer(kilnId: string, customerId: string, customerName: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.kilnId, kilnId), or(eq(invoices.customerId, customerId), and(isNull(invoices.customerId), eq(sql`lower(${invoices.customerName})`, customerName.toLowerCase())))))
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
  emitToKiln(kilnId, "invoice:update", updated);
  return updated;
}

export async function deleteInvoice(kilnId: string, id: string) {
  const existing = (await db.select().from(invoices).where(and(eq(invoices._id, id), eq(invoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Invoice not found in this kiln");
  await db.delete(invoices).where(eq(invoices._id, id));
  emitToKiln(kilnId, "invoice:update", { _id: id, deleted: true });
}
