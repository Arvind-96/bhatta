import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { bankTransactions, ledgerEntries, invoices, expenses, supplierInvoices, people, customers, suppliers, BANK_TRANSACTION_DIRECTIONS } from "../db/schema";
import { getBankAccount } from "./bankAccount.service";
import { emitToKiln } from "../config/socket";

export type BankTransactionDirection = (typeof BANK_TRANSACTION_DIRECTIONS)[number];

export interface BankTransactionInput {
  bankAccountId: string;
  date?: Date;
  description?: string;
  amount: number;
  direction: BankTransactionDirection;
  notes?: string;
}

export async function createBankTransaction(kilnId: string, seasonId: string, input: BankTransactionInput) {
  await getBankAccount(kilnId, input.bankAccountId);
  const _id = randomUUID();
  await db.insert(bankTransactions).values({ ...input, _id, kilnId, seasonId });
  const row = (await db.select().from(bankTransactions).where(eq(bankTransactions._id, _id)))[0]!;
  emitToKiln(kilnId, "bankTransaction:update", row);
  return row;
}

// Bulk import for a pasted CSV statement — each line becomes one row via
// createBankTransaction's same insert path, no live bank-feed API involved.
export async function bulkCreateBankTransactions(kilnId: string, seasonId: string, bankAccountId: string, rows: Omit<BankTransactionInput, "bankAccountId">[]) {
  await getBankAccount(kilnId, bankAccountId);
  const inserted = [];
  for (const row of rows) {
    inserted.push(await createBankTransaction(kilnId, seasonId, { ...row, bankAccountId }));
  }
  return inserted;
}

export interface ListBankTransactionsFilter {
  reconciled?: boolean;
  from?: Date;
  to?: Date;
}

export async function listBankTransactions(kilnId: string, bankAccountId: string, filter: ListBankTransactionsFilter = {}) {
  const conditions = [eq(bankTransactions.kilnId, kilnId), eq(bankTransactions.bankAccountId, bankAccountId)];
  if (filter.reconciled !== undefined) conditions.push(eq(bankTransactions.reconciled, filter.reconciled));
  if (filter.from) conditions.push(gte(bankTransactions.date, filter.from));
  if (filter.to) conditions.push(lte(bankTransactions.date, filter.to));
  return db.select().from(bankTransactions).where(and(...conditions)).orderBy(desc(bankTransactions.date));
}

export type BookEntryType = "LEDGER" | "INVOICE" | "EXPENSE" | "SUPPLIER_INVOICE";

export interface BookEntry {
  type: BookEntryType;
  id: string;
  date: Date | null;
  party: string;
  description: string;
  amount: number;
  direction: BankTransactionDirection;
}

// Any paymentMode other than plain CASH counts as "online" — same
// convention already established in financialOverview.service.ts's
// splitByPaymentMode. CASH_AND_ONLINE contributes only its own
// onlineAmount, not the row's full amount.
function onlinePortion(paymentMode: string | null | undefined, totalAmount: number, onlineAmount: number | null | undefined): number {
  if (!paymentMode || paymentMode === "CASH") return 0;
  if (paymentMode === "CASH_AND_ONLINE") return onlineAmount ?? 0;
  return totalAmount;
}

// The "book" side of reconciliation: every online-mode transaction in the
// given window across the app's four independent subledgers (ledger
// entries, invoice payments, expense payments, supplier invoice payments —
// see person/customer/supplier/expenseType balance formulas, none of which
// share a common table), normalized into one list, excluding anything
// already matched to a bank statement line.
export async function listUnmatchedBookEntries(kilnId: string, from: Date, to: Date): Promise<BookEntry[]> {
  const alreadyMatched = await db.select({
    ledgerEntryId: bankTransactions.matchedLedgerEntryId,
    invoiceId: bankTransactions.matchedInvoiceId,
    expenseId: bankTransactions.matchedExpenseId,
    supplierInvoiceId: bankTransactions.matchedSupplierInvoiceId,
  }).from(bankTransactions).where(eq(bankTransactions.kilnId, kilnId));
  const matchedLedgerIds = new Set(alreadyMatched.map((r) => r.ledgerEntryId).filter((x): x is string => !!x));
  const matchedInvoiceIds = new Set(alreadyMatched.map((r) => r.invoiceId).filter((x): x is string => !!x));
  const matchedExpenseIds = new Set(alreadyMatched.map((r) => r.expenseId).filter((x): x is string => !!x));
  const matchedSupplierInvoiceIds = new Set(alreadyMatched.map((r) => r.supplierInvoiceId).filter((x): x is string => !!x));

  const entries: BookEntry[] = [];

  const ledgerRows = await db
    .select({ row: ledgerEntries, personName: people.name })
    .from(ledgerEntries)
    .leftJoin(people, eq(people._id, ledgerEntries.personId))
    .where(and(eq(ledgerEntries.kilnId, kilnId), gte(ledgerEntries.date, from), lte(ledgerEntries.date, to)));
  for (const { row, personName } of ledgerRows) {
    if (matchedLedgerIds.has(row._id)) continue;
    const amount = onlinePortion(row.paymentMode, row.amount, row.onlineAmount);
    if (amount <= 0) continue;
    entries.push({
      type: "LEDGER",
      id: row._id,
      date: row.date,
      party: personName ?? "Unknown",
      description: row.reason,
      amount,
      direction: row.direction === "DUE" ? "CREDIT" : "DEBIT",
    });
  }

  const invoiceRows = await db
    .select({ row: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(customers._id, invoices.customerId))
    .where(and(eq(invoices.kilnId, kilnId), eq(invoices.cancelled, false), gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)));
  for (const { row, customerName } of invoiceRows) {
    if (matchedInvoiceIds.has(row._id)) continue;
    const paidNow = row.amountPaidNow ?? row.netAmount;
    const amount = onlinePortion(row.paymentMode, paidNow, row.onlineAmount);
    if (amount <= 0) continue;
    entries.push({
      type: "INVOICE",
      id: row._id,
      date: row.invoiceDate,
      party: customerName ?? row.customerName,
      description: `Invoice #${row.sequenceNumber ?? row._id.slice(0, 8)}`,
      amount,
      direction: "CREDIT",
    });
  }

  const expenseRows = await db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), gte(expenses.date, from), lte(expenses.date, to)));
  for (const row of expenseRows) {
    if (matchedExpenseIds.has(row._id)) continue;
    const amount = onlinePortion(row.paymentMode, row.amount, row.onlineAmount);
    if (amount <= 0) continue;
    entries.push({
      type: "EXPENSE",
      id: row._id,
      date: row.date,
      party: row.notes ?? "Expense",
      description: row.notes ?? "Expense",
      amount,
      direction: "DEBIT",
    });
  }

  const supplierInvoiceRows = await db
    .select({ row: supplierInvoices, supplierName: suppliers.name })
    .from(supplierInvoices)
    .leftJoin(suppliers, eq(suppliers._id, supplierInvoices.supplierId))
    .where(and(eq(supplierInvoices.kilnId, kilnId), gte(supplierInvoices.date, from), lte(supplierInvoices.date, to)));
  for (const { row, supplierName } of supplierInvoiceRows) {
    if (matchedSupplierInvoiceIds.has(row._id)) continue;
    const amount = onlinePortion(row.paymentMode, row.amountPaid, row.onlineAmount);
    if (amount <= 0) continue;
    entries.push({
      type: "SUPPLIER_INVOICE",
      id: row._id,
      date: row.date,
      party: supplierName ?? "Supplier",
      description: `Supplier invoice #${row.sequenceNumber ?? row._id.slice(0, 8)}`,
      amount,
      direction: "DEBIT",
    });
  }

  return entries.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}

const MATCH_COLUMN: Record<BookEntryType, "matchedLedgerEntryId" | "matchedInvoiceId" | "matchedExpenseId" | "matchedSupplierInvoiceId"> = {
  LEDGER: "matchedLedgerEntryId",
  INVOICE: "matchedInvoiceId",
  EXPENSE: "matchedExpenseId",
  SUPPLIER_INVOICE: "matchedSupplierInvoiceId",
};

export async function matchTransaction(kilnId: string, bankTransactionId: string, entryType: BookEntryType, entryId: string) {
  const existing = (await db.select().from(bankTransactions).where(and(eq(bankTransactions._id, bankTransactionId), eq(bankTransactions.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Bank transaction not found in this kiln");
  await db.update(bankTransactions).set({ reconciled: true, [MATCH_COLUMN[entryType]]: entryId }).where(eq(bankTransactions._id, bankTransactionId));
  const updated = (await db.select().from(bankTransactions).where(eq(bankTransactions._id, bankTransactionId)))[0]!;
  emitToKiln(kilnId, "bankTransaction:update", updated);
  return updated;
}

export async function unmatchTransaction(kilnId: string, bankTransactionId: string) {
  const existing = (await db.select().from(bankTransactions).where(and(eq(bankTransactions._id, bankTransactionId), eq(bankTransactions.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Bank transaction not found in this kiln");
  await db.update(bankTransactions).set({
    reconciled: false,
    matchedLedgerEntryId: null,
    matchedInvoiceId: null,
    matchedExpenseId: null,
    matchedSupplierInvoiceId: null,
  }).where(eq(bankTransactions._id, bankTransactionId));
  const updated = (await db.select().from(bankTransactions).where(eq(bankTransactions._id, bankTransactionId)))[0]!;
  emitToKiln(kilnId, "bankTransaction:update", updated);
  return updated;
}

// Reconciled/unreconciled counts+amounts per account per period — the
// "Bank Reconciliation" report itself.
export async function bankReconciliationSummary(kilnId: string, bankAccountId: string, from?: Date, to?: Date) {
  const rows = await listBankTransactions(kilnId, bankAccountId, { from, to });
  const reconciled = rows.filter((r) => r.reconciled);
  const unreconciled = rows.filter((r) => !r.reconciled);
  const sum = (rs: typeof rows) => Math.round(rs.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return {
    reconciledCount: reconciled.length,
    reconciledAmount: sum(reconciled),
    unreconciledCount: unreconciled.length,
    unreconciledAmount: sum(unreconciled),
  };
}
