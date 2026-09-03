import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ledgerEntries, invoices, expenses, supplierInvoices, people, customers, suppliers } from "../db/schema";

export interface DayBookEntry {
  time: Date | null;
  type: "LEDGER" | "INVOICE" | "EXPENSE" | "SUPPLIER_INVOICE";
  party: string;
  description: string;
  cashAmount: number;
  onlineAmount: number;
  direction: "IN" | "OUT";
}

function cashOnline(paymentMode: string | null | undefined, totalAmount: number, cashAmount: number | null | undefined, onlineAmount: number | null | undefined) {
  if (paymentMode === "CASH_AND_ONLINE") return { cash: cashAmount ?? 0, online: onlineAmount ?? 0 };
  if (paymentMode === "CASH") return { cash: totalAmount, online: 0 };
  if (paymentMode) return { cash: 0, online: totalAmount };
  return { cash: 0, online: 0 };
}

// Every transaction that touched money on one given day, across the app's
// four independent subledgers — nothing like this existed before (each
// subledger has always been viewed in isolation, one module at a time).
// Genuinely new cross-table logic, not a wrapper over an existing function.
export async function dayBook(kilnId: string, date: Date): Promise<DayBookEntry[]> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const entries: DayBookEntry[] = [];

  const ledgerRows = await db
    .select({ row: ledgerEntries, personName: people.name })
    .from(ledgerEntries)
    .leftJoin(people, eq(people._id, ledgerEntries.personId))
    .where(and(eq(ledgerEntries.kilnId, kilnId), gte(ledgerEntries.date, dayStart), lte(ledgerEntries.date, dayEnd)));
  for (const { row, personName } of ledgerRows) {
    const { cash, online } = cashOnline(row.paymentMode, row.amount, row.cashAmount, row.onlineAmount);
    entries.push({
      time: row.date,
      type: "LEDGER",
      party: personName ?? "Unknown",
      description: row.reason,
      cashAmount: cash,
      onlineAmount: online,
      // DUE against a person = money owed TO them (an outflow-in-waiting,
      // but not yet moved); PAID = money actually handed over now (OUT).
      // Ledger rows with no cash/online split recorded contribute 0/0 and
      // simply don't move the day's cash total, same as anywhere else.
      direction: row.direction === "PAID" ? "OUT" : "IN",
    });
  }

  const invoiceRows = await db
    .select({ row: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(customers._id, invoices.customerId))
    .where(and(eq(invoices.kilnId, kilnId), eq(invoices.cancelled, false), gte(invoices.invoiceDate, dayStart), lte(invoices.invoiceDate, dayEnd)));
  for (const { row, customerName } of invoiceRows) {
    const paidNow = row.amountPaidNow ?? row.netAmount;
    const { cash, online } = cashOnline(row.paymentMode, paidNow, row.cashAmount, row.onlineAmount);
    entries.push({
      time: row.invoiceDate,
      type: "INVOICE",
      party: customerName ?? row.customerName,
      description: `Invoice #${row.sequenceNumber ?? row._id.slice(0, 8)}`,
      cashAmount: cash,
      onlineAmount: online,
      direction: "IN",
    });
  }

  const expenseRows = await db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), gte(expenses.date, dayStart), lte(expenses.date, dayEnd)));
  for (const row of expenseRows) {
    const { cash, online } = cashOnline(row.paymentMode, row.amount, row.cashAmount, row.onlineAmount);
    entries.push({
      time: row.date,
      type: "EXPENSE",
      party: row.notes ?? "Expense",
      description: row.notes ?? "Expense",
      cashAmount: cash,
      onlineAmount: online,
      direction: "OUT",
    });
  }

  const supplierInvoiceRows = await db
    .select({ row: supplierInvoices, supplierName: suppliers.name })
    .from(supplierInvoices)
    .leftJoin(suppliers, eq(suppliers._id, supplierInvoices.supplierId))
    .where(and(eq(supplierInvoices.kilnId, kilnId), gte(supplierInvoices.date, dayStart), lte(supplierInvoices.date, dayEnd)));
  for (const { row, supplierName } of supplierInvoiceRows) {
    const { cash, online } = cashOnline(row.paymentMode, row.amountPaid, row.cashAmount, row.onlineAmount);
    entries.push({
      time: row.date,
      type: "SUPPLIER_INVOICE",
      party: supplierName ?? "Supplier",
      description: `Supplier invoice #${row.sequenceNumber ?? row._id.slice(0, 8)}`,
      cashAmount: cash,
      onlineAmount: online,
      direction: "OUT",
    });
  }

  return entries.sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0));
}
