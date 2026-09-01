import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { supplierInvoices, suppliers, expenses, type SupplierInvoiceItem } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { emitToKiln } from "../config/socket";
import { autoLogExpense } from "./expense.service";

type PaymentMode = (typeof SIMPLE_PAYMENT_MODES)[number];

export interface SupplierInvoiceInput {
  supplierId: string;
  seasonId: string;
  date?: Date;
  itemsReceived?: SupplierInvoiceItem[];
  totalBillAmount: number;
  amountPaid?: number;
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  // Set when this invoice is (partially) fulfilling a pending Purchase
  // Order — see purchaseOrder.service.ts's fulfillPurchaseOrder, the only
  // caller that sets this. Purely a pass-through link.
  purchaseOrderId?: string;
}

// MAX-based (not COUNT-based) so a deleted invoice's number is never
// reissued to a different real transaction — same reasoning as the
// existing Challan/Gate Pass/Invoice generateSequenceNumber. Scoped to the
// season so numbering resets to 1 each new Bhatta Season.
async function nextSequenceNumber(kilnId: string, seasonId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${supplierInvoices.sequenceNumber})` }).from(supplierInvoices).where(and(eq(supplierInvoices.kilnId, kilnId), eq(supplierInvoices.seasonId, seasonId))))[0];
  return (maxRow?.max ?? 0) + 1;
}

// What the kiln has actually paid a supplier for goods received — real
// money out, same as a Doctor Visit's cost, so it's auto-logged as a first
// -class Expense the moment it's paid (see autoLogExpense). Previously
// invisible everywhere in the app's cost accounting: amountPaid just sat
// on this row with no ledger entry and no Expense, unlike every other
// payment type in the app.
export async function createSupplierInvoice(kilnId: string, input: SupplierInvoiceInput) {
  const supplier = (await db.select().from(suppliers).where(and(eq(suppliers._id, input.supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!supplier) throw new Error("Supplier not found in this kiln");

  const _id = randomUUID();
  const sequenceNumber = await nextSequenceNumber(kilnId, input.seasonId);
  await db.insert(supplierInvoices).values({ ...input, _id, kilnId, sequenceNumber });
  const row = (await db.select().from(supplierInvoices).where(eq(supplierInvoices._id, _id)))[0]!;

  await autoLogExpense(
    kilnId,
    input.seasonId,
    "Supplier Purchase",
    input.amountPaid,
    input.date,
    `Supplier invoice #${sequenceNumber} — ${supplier.name}`,
    { supplierInvoiceId: _id, paymentMode: input.paymentMode, cashAmount: input.cashAmount, onlineAmount: input.onlineAmount }
  );

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

// Keeps the linked Expense row (matched via expenses.supplierInvoiceId) in
// sync with any amountPaid/date/payment edit — same reasoning as
// updateDoctorVisit. An invoice that had no payment yet (no linked
// Expense) but is now given one gets logged for the first time here,
// rather than the edit's payment silently never reaching the Expense page.
export async function updateSupplierInvoice(kilnId: string, invoiceId: string, input: Partial<SupplierInvoiceInput>) {
  const existing = (await db.select().from(supplierInvoices).where(and(eq(supplierInvoices._id, invoiceId), eq(supplierInvoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier invoice not found in this kiln");
  await db.update(supplierInvoices).set(input).where(eq(supplierInvoices._id, invoiceId));
  const updated = (await db.select().from(supplierInvoices).where(eq(supplierInvoices._id, invoiceId)))[0]!;

  const newAmountPaid = input.amountPaid ?? existing.amountPaid;
  const linkedExpense = (await db.select().from(expenses).where(eq(expenses.supplierInvoiceId, invoiceId)))[0];
  const paymentMode = input.paymentMode ?? existing.paymentMode ?? undefined;
  const cashAmount = input.cashAmount ?? existing.cashAmount ?? undefined;
  const onlineAmount = input.onlineAmount ?? existing.onlineAmount ?? undefined;
  const date = input.date ?? existing.date ?? undefined;

  if (linkedExpense) {
    await db
      .update(expenses)
      .set({ amount: newAmountPaid, date, paymentMode, cashAmount, onlineAmount })
      .where(eq(expenses._id, linkedExpense._id));
    const updatedExpense = (await db.select().from(expenses).where(eq(expenses._id, linkedExpense._id)))[0]!;
    emitToKiln(kilnId, "expense:update", updatedExpense);
  } else if (newAmountPaid > 0) {
    const supplier = (await db.select().from(suppliers).where(eq(suppliers._id, existing.supplierId)))[0];
    await autoLogExpense(
      kilnId,
      existing.seasonId ?? "",
      "Supplier Purchase",
      newAmountPaid,
      date,
      `Supplier invoice #${existing.sequenceNumber} — ${supplier?.name ?? "—"}`,
      { supplierInvoiceId: invoiceId, paymentMode, cashAmount, onlineAmount }
    );
  }

  emitToKiln(kilnId, "supplierInvoice:update", updated);
  return updated;
}

export async function deleteSupplierInvoice(kilnId: string, invoiceId: string) {
  const existing = (await db.select().from(supplierInvoices).where(and(eq(supplierInvoices._id, invoiceId), eq(supplierInvoices.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier invoice not found in this kiln");
  await db.delete(supplierInvoices).where(eq(supplierInvoices._id, invoiceId));

  const linkedExpense = (await db.select().from(expenses).where(eq(expenses.supplierInvoiceId, invoiceId)))[0];
  if (linkedExpense) {
    await db.delete(expenses).where(eq(expenses._id, linkedExpense._id));
    emitToKiln(kilnId, "expense:update", { _id: linkedExpense._id, deleted: true });
  }

  emitToKiln(kilnId, "supplierInvoice:update", { _id: invoiceId, deleted: true });
  return existing;
}
