import { double, mysqlTable, varchar, text, boolean, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

// A bank account the kiln holds — admin-entered, no live bank-feed
// integration (this app has no banking API credentials to connect to any
// specific bank). openingBalance/openingBalanceDate are the admin-entered
// starting point statement lines get reconciled against; the running "book
// balance" for online-mode transactions is computed live from
// ledgerEntries/invoices/expenses/supplierInvoices, same "opening + live
// recomputation" idiom already used by customers/expenseTypes.
export const bankAccounts = mysqlTable("bank_accounts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  bankName: varchar("bankName", { length: 255 }).notNull(),
  accountLabel: varchar("accountLabel", { length: 255 }),
  accountNumberLast4: varchar("accountNumberLast4", { length: 10 }),
  openingBalance: double("openingBalance").notNull().default(0),
  openingBalanceDate: dateColumn("openingBalanceDate"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnIdx: index("bankaccount_kiln_idx").on(t.kilnId) }));

export const BANK_TRANSACTION_DIRECTIONS = ["CREDIT", "DEBIT"] as const;

// One row per statement line — hand-entered by the admin (or pasted in
// bulk from a downloaded CSV/PDF statement) rather than pulled from a live
// bank feed. Reconciling means matching one of these against the one
// "book" transaction (a ledger entry, an invoice's paid portion, an
// expense, or a supplier invoice's paid portion) it corresponds to.
export const bankTransactions = mysqlTable("bank_transactions", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  bankAccountId: varchar("bankAccountId", { length: 64 }).notNull(),
  date: dateColumn(),
  description: text("description"),
  amount: double("amount").notNull(),
  direction: varchar("direction", { length: 10, enum: BANK_TRANSACTION_DIRECTIONS }).notNull(),
  reconciled: boolean("reconciled").notNull().default(false),
  // Exactly one of these is set once reconciled=true — which "book" table
  // this statement line was matched against.
  matchedLedgerEntryId: varchar("matchedLedgerEntryId", { length: 64 }),
  matchedInvoiceId: varchar("matchedInvoiceId", { length: 64 }),
  matchedExpenseId: varchar("matchedExpenseId", { length: 64 }),
  matchedSupplierInvoiceId: varchar("matchedSupplierInvoiceId", { length: 64 }),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnAccountIdx: index("banktxn_kiln_account_idx").on(t.kilnId, t.bankAccountId),
  kilnReconciledIdx: index("banktxn_kiln_reconciled_idx").on(t.kilnId, t.reconciled),
}));
