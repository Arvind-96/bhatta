import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { challans, gatePasses, invoices, dispatches, DISPATCH_PAYMENT_MODES } from "../db/schema";
import { isDuplicateEntryError, MAX_NUMBER_GENERATION_ATTEMPTS } from "./dispatch.service";
import { emitToKiln } from "../config/socket";

type PaymentMode = (typeof DISPATCH_PAYMENT_MODES)[number];

// MAX-based, not COUNT-based — see brickLoading.service.ts's
// generateTripNumber for the exact collision-after-delete bug this avoids.
async function generateSequenceNumber(table: typeof challans | typeof gatePasses | typeof invoices, kilnId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${table.sequenceNumber})` }).from(table).where(eq(table.kilnId, kilnId)))[0];
  return (maxRow?.max ?? 0) + 1;
}

async function assertDispatch(kilnId: string, dispatchId: string) {
  const dispatch = (await db.select().from(dispatches).where(and(eq(dispatches._id, dispatchId), eq(dispatches.kilnId, kilnId))))[0];
  if (!dispatch) throw new Error("Dispatch not found in this kiln");
  return dispatch;
}

// ---- Challan (delivery note, no pricing) ----

export interface ChallanInput {
  dispatchId: string;
  vehicleNumber?: string;
  vehicleType?: string;
  driverName?: string;
  driverPhone?: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  categoryId?: string;
  bricksCount: number;
  challanDate?: Date;
  notes?: string;
}

export async function createChallan(kilnId: string, input: ChallanInput) {
  await assertDispatch(kilnId, input.dispatchId);
  let row: typeof challans.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const sequenceNumber = await generateSequenceNumber(challans, kilnId);
    const _id = randomUUID();
    try {
      await db.insert(challans).values({ ...input, _id, kilnId, sequenceNumber });
      row = (await db.select().from(challans).where(eq(challans._id, _id)))[0];
      break;
    } catch (err) {
      lastError = err;
      if (!isDuplicateEntryError(err)) throw err;
    }
  }
  if (!row) throw lastError instanceof Error ? lastError : new Error("Failed to create challan: could not allocate a unique number");
  emitToKiln(kilnId, "challan:update", row);
  return row;
}

export async function listChallans(kilnId: string, dispatchId?: string) {
  const conditions = [eq(challans.kilnId, kilnId)];
  if (dispatchId) conditions.push(eq(challans.dispatchId, dispatchId));
  return db.select().from(challans).where(and(...conditions)).orderBy(desc(challans.createdAt));
}

export async function updateChallan(kilnId: string, id: string, input: Partial<Omit<ChallanInput, "dispatchId">>) {
  const existing = (await db.select().from(challans).where(and(eq(challans._id, id), eq(challans.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Challan not found in this kiln");
  await db.update(challans).set(input).where(eq(challans._id, id));
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
  vehicleNumber?: string;
  vehicleType?: string;
  driverName?: string;
  driverPhone?: string;
  customerName: string;
  categoryId?: string;
  bricksCount: number;
  gatePassDate?: Date;
  notes?: string;
}

export async function createGatePass(kilnId: string, input: GatePassInput) {
  await assertDispatch(kilnId, input.dispatchId);
  let row: typeof gatePasses.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const sequenceNumber = await generateSequenceNumber(gatePasses, kilnId);
    const _id = randomUUID();
    try {
      await db.insert(gatePasses).values({ ...input, _id, kilnId, sequenceNumber });
      row = (await db.select().from(gatePasses).where(eq(gatePasses._id, _id)))[0];
      break;
    } catch (err) {
      lastError = err;
      if (!isDuplicateEntryError(err)) throw err;
    }
  }
  if (!row) throw lastError instanceof Error ? lastError : new Error("Failed to create gate pass: could not allocate a unique number");
  emitToKiln(kilnId, "gatePass:update", row);
  return row;
}

export async function listGatePasses(kilnId: string, dispatchId?: string) {
  const conditions = [eq(gatePasses.kilnId, kilnId)];
  if (dispatchId) conditions.push(eq(gatePasses.dispatchId, dispatchId));
  return db.select().from(gatePasses).where(and(...conditions)).orderBy(desc(gatePasses.createdAt));
}

export async function updateGatePass(kilnId: string, id: string, input: Partial<Omit<GatePassInput, "dispatchId">>) {
  const existing = (await db.select().from(gatePasses).where(and(eq(gatePasses._id, id), eq(gatePasses.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Gate pass not found in this kiln");
  await db.update(gatePasses).set(input).where(eq(gatePasses._id, id));
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
  dispatchId: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerGstNumber?: string;
  categoryId?: string;
  bricksCount: number;
  ratePerBrick?: number;
  grossAmount?: number;
  discountAmount?: number;
  netAmount: number;
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  invoiceDate?: Date;
  notes?: string;
}

export async function createInvoice(kilnId: string, input: InvoiceInput) {
  await assertDispatch(kilnId, input.dispatchId);
  let row: typeof invoices.$inferSelect | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const sequenceNumber = await generateSequenceNumber(invoices, kilnId);
    const _id = randomUUID();
    try {
      await db.insert(invoices).values({ ...input, _id, kilnId, sequenceNumber });
      row = (await db.select().from(invoices).where(eq(invoices._id, _id)))[0];
      break;
    } catch (err) {
      lastError = err;
      if (!isDuplicateEntryError(err)) throw err;
    }
  }
  if (!row) throw lastError instanceof Error ? lastError : new Error("Failed to create invoice: could not allocate a unique number");
  emitToKiln(kilnId, "invoice:update", row);
  return row;
}

export async function listInvoices(kilnId: string, dispatchId?: string) {
  const conditions = [eq(invoices.kilnId, kilnId)];
  if (dispatchId) conditions.push(eq(invoices.dispatchId, dispatchId));
  return db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.createdAt));
}

export async function updateInvoice(kilnId: string, id: string, input: Partial<Omit<InvoiceInput, "dispatchId">>) {
  const existing = (await db.select().from(invoices).where(and(eq(invoices._id, id), eq(invoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Invoice not found in this kiln");
  await db.update(invoices).set(input).where(eq(invoices._id, id));
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
