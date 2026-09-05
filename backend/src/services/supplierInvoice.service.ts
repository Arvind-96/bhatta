import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { supplierInvoices, suppliers, expenses, purchaseOrders, type SupplierInvoiceItem } from "../db/schema";
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

// Bug fix (H7): purchaseOrders.purchaseOrderId is stamped onto every
// Supplier Invoice created by fulfilling that order (see
// fulfillPurchaseOrder), but nothing in the frontend ever looked it up —
// no Purchase Order row showed which invoice(s) fulfilled it. Kept
// deliberately minimal, same reasoning as listDispatchesForSaleOrder.
export async function listSupplierInvoicesForPurchaseOrder(kilnId: string, purchaseOrderId: string) {
  return db
    .select({ _id: supplierInvoices._id, sequenceNumber: supplierInvoices.sequenceNumber, totalBillAmount: supplierInvoices.totalBillAmount, amountPaid: supplierInvoices.amountPaid, date: supplierInvoices.date })
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.kilnId, kilnId), eq(supplierInvoices.purchaseOrderId, purchaseOrderId)))
    .orderBy(desc(supplierInvoices.date));
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

// Every supplier with a real outstanding balance across all their invoices
// (all-time, same "no season filter" convention getSupplierDetail already
// uses — an invoice due doesn't reset at a season boundary). Feeds
// person.service.ts's listPaymentsDue, which used to be structurally
// unable to see supplier debt at all (suppliers live in their own table,
// never in `people`/`ledgerEntries`) — Financial Overview/Dashboard's
// "Total Dues" (whose own doc comment always claimed to mean "labor/
// contractors/suppliers") silently excluded every supplier due, while
// Reports → Debtors & Creditors (which loops suppliers directly) already
// included them, so the two disagreed by exactly this amount.
export async function listSupplierDuesAcrossKiln(kilnId: string) {
  const [supplierRows, invoiceRows] = await Promise.all([
    db.select().from(suppliers).where(eq(suppliers.kilnId, kilnId)),
    db.select().from(supplierInvoices).where(eq(supplierInvoices.kilnId, kilnId)),
  ]);
  const dueBySupplier = new Map<string, number>();
  for (const inv of invoiceRows) {
    dueBySupplier.set(inv.supplierId, (dueBySupplier.get(inv.supplierId) ?? 0) + (inv.totalBillAmount - inv.amountPaid));
  }
  return supplierRows
    .map((s) => ({ supplier: { id: s._id, name: s.name, phone: s.phone ?? null }, amountDue: Math.round((dueBySupplier.get(s._id) ?? 0) * 100) / 100 }))
    .filter((r) => r.amountDue > 0);
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

  // Otherwise a Purchase Order's status stays stuck at FULFILLED/
  // PARTIALLY_FULFILLED forever once the invoice that earned it is gone —
  // same reasoning as dispatch.service.ts's identical fix for Sale
  // Orders. A purchase order can be fulfilled across more than one
  // invoice (see fulfillPurchaseOrder's own comment), so this only reverts
  // to PENDING if no other invoice is still linked to it.
  if (existing.purchaseOrderId) {
    const order = (await db.select().from(purchaseOrders).where(eq(purchaseOrders._id, existing.purchaseOrderId)))[0];
    if (order && order.status !== "CANCELLED") {
      const remaining = await db.select({ _id: supplierInvoices._id }).from(supplierInvoices).where(eq(supplierInvoices.purchaseOrderId, existing.purchaseOrderId));
      if (remaining.length === 0) {
        await db.update(purchaseOrders).set({ status: "PENDING" }).where(eq(purchaseOrders._id, existing.purchaseOrderId));
        emitToKiln(kilnId, "purchaseOrder:update", (await db.select().from(purchaseOrders).where(eq(purchaseOrders._id, existing.purchaseOrderId)))[0]);
      }
    }
  }

  emitToKiln(kilnId, "supplierInvoice:update", { _id: invoiceId, deleted: true });
  return existing;
}
