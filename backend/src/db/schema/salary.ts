import { double, mysqlTable, varchar, uniqueIndex } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn } from "./_helpers";

// One row per person per calendar month — generated automatically on the
// 1st (see salary.service.ts) or manually via the Salary page. The slip
// itself is a pair of PDF files on disk (English + Hindi); this row is
// just the computed numbers plus where to find them.
export const salarySlips = mysqlTable("salary_slips", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: varchar("personId", { length: 64 }).notNull(),
  month: varchar("month", { length: 20 }).notNull(), // "YYYY-MM"
  daysPresent: double("daysPresent").notNull(),
  daysAbsent: double("daysAbsent").notNull(),
  daysHalfDay: double("daysHalfDay").notNull(),
  daysLate: double("daysLate").notNull(),
  grossSalary: double("grossSalary").notNull(),
  deductions: double("deductions").notNull(),
  netSalary: double("netSalary").notNull(),
  pdfPathEn: varchar("pdfPathEn", { length: 512 }).notNull(),
  pdfPathHi: varchar("pdfPathHi", { length: 512 }).notNull(),
  generatedAt: createdAtColumn(),
}, (t) => ({
  personMonthUnique: uniqueIndex("salary_person_month_unique").on(t.personId, t.month),
}));
