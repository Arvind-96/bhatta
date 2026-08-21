import { double, int, mysqlTable, varchar, text, datetime, uniqueIndex } from "drizzle-orm/mysql-core";
import { idColumn, createdAtColumn } from "./_helpers";

export const kilns = mysqlTable("kilns", {
  _id: idColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  onboardedAt: datetime("onboardedAt", { mode: "date" }),
  latitude: double("latitude"),
  longitude: double("longitude"),
  radiusMeters: int("radiusMeters").default(200),
  yardCapacityBricks: int("yardCapacityBricks"),
  // The bhatta season, e.g. Aug 1 – Jul 31 by default — used for
  // season-scoped reporting. Month is 1-12, day is 1-31.
  seasonStartMonth: int("seasonStartMonth").default(8),
  seasonStartDay: int("seasonStartDay").default(1),
  // Reference info for the Attendance roster page — not an auto clock-in
  // (there's no check-in device), just the shift window shown to the admin
  // so "Late" has a concrete meaning when marking someone manually.
  dayShiftStart: varchar("dayShiftStart", { length: 255 }).default("08:00"),
  dayShiftEnd: varchar("dayShiftEnd", { length: 255 }).default("18:00"),
  // Printed on the Challan when set — optional, many small kilns aren't
  // GST-registered.
  gstNumber: varchar("gstNumber", { length: 255 }),
  // GST invoice billing details (Settings > Billing) — all optional, all
  // print-only (never touch ledger/customer-balance math). `stateCode` is
  // free text (e.g. "UP Code 09"), matching how the admin's own paper
  // invoice book labels it — not decomposed into a structured state+number
  // pair, since it's shown verbatim on the invoice, never parsed.
  stateCode: varchar("stateCode", { length: 255 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 255 }),
  bankName: varchar("bankName", { length: 255 }),
  bankIfscCode: varchar("bankIfscCode", { length: 255 }),
  // Relative path under DATA_DIR, same convention as people.photoPath —
  // see replaceKilnFile in auth.service.ts.
  signaturePath: varchar("signaturePath", { length: 512 }),
  // Copied onto each new invoice as an editable snapshot (see
  // invoices.termsAndConditions) rather than referenced live, so an old
  // invoice's printed terms never silently change if this default is
  // edited later.
  defaultTermsAndConditions: text("defaultTermsAndConditions"),
  createdAt: createdAtColumn(),
});

export const users = mysqlTable("users", {
  _id: idColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
}));

export const kilnMemberships = mysqlTable("kiln_memberships", {
  _id: idColumn(),
  userId: varchar("userId", { length: 64 }).notNull(),
  kilnId: varchar("kilnId", { length: 64 }).notNull(),
  role: varchar("role", { length: 50, enum: ["OWNER", "MANAGER", "MUNIM"] }).notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({
  userKilnUnique: uniqueIndex("membership_user_kiln_unique").on(t.userId, t.kilnId),
}));

export const syncLogs = mysqlTable("sync_logs", {
  _id: idColumn(),
  kilnId: varchar("kilnId", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 255 }).notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("APPLIED"),
  createdAt: createdAtColumn(),
});
