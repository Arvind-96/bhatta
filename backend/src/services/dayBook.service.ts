import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ledgerEntries, invoices, expenses, supplierInvoices, people, customers, suppliers } from "../db/schema";
import { istStartOfDay, istEndOfDay } from "../utils/istTime";
import { cashOnlineSplit } from "./reports/types";
import { unbilledDispatchRows } from "./reports/trade.reports";

export interface DayBookEntry {
  time: Date | null;
  type: "LEDGER" | "INVOICE" | "EXPENSE" | "SUPPLIER_INVOICE";
  party: string;
  description: string;
  cashAmount: number;
  onlineAmount: number;
  direction: "IN" | "OUT";
}

// Bug fix: this used to return the row's raw cashAmount/onlineAmount
// unscaled for CASH_AND_ONLINE — those are recorded against the row's
// FULL amount at creation time, but the figure being reported here
// (paidNow for an invoice, the row's own amount otherwise) can be less on
// a partially-paid row, so returning them unscaled double-counted the
// still-due remainder (documented already for this exact bug class in
// reports/production.reports.ts's own comment). Delegates to the shared,
// already-scaled `cashOnlineSplit` every other report uses instead of
// keeping a second, independently-drifting copy of this formula.
function cashOnline(paymentMode: string | null | undefined, totalAmount: number, cashAmount: number | null | undefined, onlineAmount: number | null | undefined) {
  return cashOnlineSplit(paymentMode, cashAmount, onlineAmount, totalAmount);
}

// Every transaction that touched money across the app's four independent
// subledgers, over a given date range — nothing like this existed before
// (each subledger has always been viewed in isolation, one module at a
// time). Genuinely new cross-table logic, not a wrapper over an existing
// function.
//
// Bug fix: this used to hard-lock to a single calendar day (`to` was
// silently ignored, with no UI indication it even existed for this report)
// and never included cash from a same-day sale that hasn't been formally
// invoiced yet — unlike Customers/Invoices/Sales-by-Category, which were
// explicitly fixed to include unbilled dispatches earlier this session.
export async function dayBook(kilnId: string, from: Date, to: Date = from): Promise<DayBookEntry[]> {
  // Bug fix: server-local (UTC) midnight, not IST — see fuelLog.service.ts's
  // fuelLogPeriodTotals for the same fix and full explanation. Day Book is
  // a cash-reconciliation tool read against the physical calendar day, so
  // this boundary mattering is especially visible here.
  const dayStart = istStartOfDay(from);
  const dayEnd = istEndOfDay(to);

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

  // Same real sale, same money, just no GST document printed against it
  // yet — see unbilledDispatchRows' own doc comment. Already excludes any
  // dispatch that has a (non-cancelled) invoice, so this can never
  // double-count against the invoiceRows block above.
  const unbilledRows = await unbilledDispatchRows(kilnId, { from: dayStart, to: dayEnd });
  for (const row of unbilledRows) {
    const paidNow = row.amountPaidNow ?? row.netAmount;
    const { cash, online } = cashOnline(row.paymentMode, paidNow, row.cashAmount, row.onlineAmount);
    entries.push({
      time: row.invoiceDate,
      type: "INVOICE",
      party: row.customerName,
      description: `Dispatch (not yet invoiced) — ${row.dispatchId?.slice(0, 8) ?? row._id}`,
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
