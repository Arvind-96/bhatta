import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { supplierInvoices, suppliers, type SupplierInvoiceItem } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { emitToKiln } from "../config/socket";

type PaymentMode = (typeof SIMPLE_PAYMENT_MODES)[number];

export interface SupplierInvoiceInput {
  supplierId: string;
  date?: Date;
  itemsReceived?: SupplierInvoiceItem[];
  totalBillAmount: number;
  amountPaid?: number;
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
}

// MAX-based (not COUNT-based) so a deleted invoice's number is never
// reissued to a different real transaction — same reasoning as the
// existing Challan/Gate Pass/Invoice generateSequenceNumber.
async function nextSequenceNumber(kilnId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${supplierInvoices.sequenceNumber})` }).from(supplierInvoices).where(eq(supplierInvoices.kilnId, kilnId)))[0];
  return (maxRow?.max ?? 0) + 1;
}

export async function createSupplierInvoice(kilnId: string, input: SupplierInvoiceInput) {
  const supplier = (await db.select().from(suppliers).where(and(eq(suppliers._id, input.supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!supplier) throw new Error("Supplier not found in this kiln");

  const _id = randomUUID();
  const sequenceNumber = await nextSequenceNumber(kilnId);
  await db.insert(supplierInvoices).values({ ...input, _id, kilnId, sequenceNumber });
  const row = (await db.select().from(supplierInvoices).where(eq(supplierInvoices._id, _id)))[0]!;
  emitToKiln(kilnId, "supplierInvoice:update", row);
  return row;
}

export async function listSupplierInvoices(kilnId: string, supplierId: string) {
  return db
    .select()
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.kilnId, kilnId), eq(supplierInvoices.supplierId, supplierId)))
    .orderBy(desc(supplierInvoices.date), desc(supplierInvoices.createdAt));
}

// Kiln-wide, every supplier — feeds the Supply Items catalog's "total
// received" figure, which sums itemsReceived across every supplier's
// invoices rather than just one.
export async function listAllSupplierInvoices(kilnId: string) {
  return db.select().from(supplierInvoices).where(eq(supplierInvoices.kilnId, kilnId)).orderBy(desc(supplierInvoices.date));
}

// Total paid/pending across every invoice for this supplier — never
// stored, always recomputed from amountPaid/totalBillAmount so an edit
// to either can never leave a stale balance behind (same convention as
// getCustomerDetail's totalPaid/totalDue).
export async function getSupplierDetail(kilnId: string, supplierId: string) {
  const supplier = (await db.select().from(suppliers).where(and(eq(suppliers._id, supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!supplier) throw new Error("Supplier not found in this kiln");

  const invoiceRows = await listSupplierInvoices(kilnId, supplierId);
  let totalPaid = 0;
  let totalDue = 0;
  for (const inv of invoiceRows) {
    totalPaid += inv.amountPaid;
    totalDue += inv.totalBillAmount - inv.amountPaid;
  }
  totalPaid = Math.round(totalPaid * 100) / 100;
  totalDue = Math.round(totalDue * 100) / 100;

  return { supplier, invoices: invoiceRows, totalPaid, totalDue };
}

export async function updateSupplierInvoice(kilnId: string, invoiceId: string, input: Partial<SupplierInvoiceInput>) {
  const existing = (await db.select().from(supplierInvoices).where(and(eq(supplierInvoices._id, invoiceId), eq(supplierInvoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier invoice not found in this kiln");
  await db.update(supplierInvoices).set(input).where(eq(supplierInvoices._id, invoiceId));
  const updated = (await db.select().from(supplierInvoices).where(eq(supplierInvoices._id, invoiceId)))[0]!;
  emitToKiln(kilnId, "supplierInvoice:update", updated);
  return updated;
}

export async function deleteSupplierInvoice(kilnId: string, invoiceId: string) {
  const existing = (await db.select().from(supplierInvoices).where(and(eq(supplierInvoices._id, invoiceId), eq(supplierInvoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier invoice not found in this kiln");
  await db.delete(supplierInvoices).where(eq(supplierInvoices._id, invoiceId));
  emitToKiln(kilnId, "supplierInvoice:update", { _id: invoiceId, deleted: true });
  return existing;
}
