import { double, mysqlTable, varchar, uniqueIndex } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn } from "./_helpers";

// One row per person per calendar month — generated automatically on the
// 1st (see salary.service.ts) or manually via the Salary page. The slip
// itself is a pair of PDF files on disk (English + Hindi); this row is
// just the computed numbers plus where to find them.
export const salarySlips = mysqlTable("salary_slips", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  personId: varchar("personId", { length: 64 }).notNull(),
  month: varchar("month", { length: 20 }).notNull(), // "YYYY-MM"
  daysPresent: double("daysPresent").notNull(),
  daysAbsent: double("daysAbsent").notNull(),
  daysHalfDay: double("daysHalfDay").notNull(),
  daysLate: double("daysLate").notNull(),
  grossSalary: double("grossSalary").notNull(),
  deductions: double("deductions").notNull(),
  // Sum of this person's Advance/Kharchi/Medical-category ledger entries
  // dated within this slip's month, netted against grossSalary alongside
  // `deductions` (see salary.service.ts's generateSalarySlip) — kept
  // separate from `deductions` so the slip/profile can show "docked for
  // absence" and "advance recovered" as distinct line items instead of
  // one opaque total.
  advanceDeducted: double("advanceDeducted").notNull().default(0),
  // This person's ledger balance as of the END of the PRIOR month
  // (positive = kiln still owed them, negative = they'd been advanced
  // more than earned) — folded into this month's netSalary so an
  // overdrawn balance actually reduces next month's pay instead of
  // silently resetting every month. See generateSalarySlip's own comment
  // for exactly how this is computed and kept in sync with the ledger.
  carriedForward: double("carriedForward").notNull().default(0),
  netSalary: double("netSalary").notNull(),
  pdfPathEn: varchar("pdfPathEn", { length: 512 }).notNull(),
  pdfPathHi: varchar("pdfPathHi", { length: 512 }).notNull(),
  // The ledger entry (category SALARY, direction DUE) auto-posted for
  // this month's earned pay (grossSalary - deductions) the moment this
  // slip is generated -- what actually makes the carry-forward above work
  // (and what makes this person's Financial Ledger show real earnings
  // instead of only advances). Regenerating updates this same entry
  // rather than creating a second one for the same month, the same
  // find-and-update-by-link-column pattern expense.service.ts's
  // autoLogExpense already uses for Doctor Visits/Brick Loading costs.
  salaryLedgerEntryId: varchar("salaryLedgerEntryId", { length: 64 }),
  generatedAt: createdAtColumn(),
}, (t) => ({
  personMonthUnique: uniqueIndex("salary_person_month_unique").on(t.personId, t.month),
}));
