import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { idColumn, kilnIdColumn, createdAtColumn } from "./_helpers";

// One row per person per calendar month — generated automatically on the
// 1st (see salary.service.ts) or manually via the Salary page. The slip
// itself is a pair of PDF files on disk (English + Hindi); this row is
// just the computed numbers plus where to find them.
export const salarySlips = sqliteTable("salary_slips", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: text("personId").notNull(),
  month: text("month").notNull(), // "YYYY-MM"
  daysPresent: real("daysPresent").notNull(),
  daysAbsent: real("daysAbsent").notNull(),
  daysHalfDay: real("daysHalfDay").notNull(),
  daysLate: real("daysLate").notNull(),
  grossSalary: real("grossSalary").notNull(),
  deductions: real("deductions").notNull(),
  netSalary: real("netSalary").notNull(),
  pdfPathEn: text("pdfPathEn").notNull(),
  pdfPathHi: text("pdfPathHi").notNull(),
  generatedAt: createdAtColumn(),
}, (t) => ({
  personMonthUnique: uniqueIndex("salary_person_month_unique").on(t.personId, t.month),
}));
