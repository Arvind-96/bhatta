import { double, int, mysqlTable, varchar, text, uniqueIndex, index, boolean, datetime } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const PERSON_TYPES = [
  "DRIVER", "LABOUR_CONTRACTOR", "SUPPLIER", "THEKEDAR", "PARTNER", "WORKER",
  "HELPER", "LANDOWNER", "FITTER", "CUSTOMER", "MUNIM", "CHOWKIDAR",
] as const;
export const WORK_TYPES = [
  "PATHAI", "BHARAI_TRANSPORT", "PAKAYI", "NIKASI", "LOADING", "BHARAI_CHAMBER_STACKING",
  "TUDI", "RAWAS", "BELDAR",
] as const;
export const SEX_OPTIONS = ["MALE", "FEMALE", "OTHER"] as const;
export const PERSON_STATUSES = ["ACTIVE", "ABSCONDED"] as const;
export const STACKING_STAGES = ["TRANSPORT", "CHAMBER_STACKING"] as const;

// Single-table-inheritance across 12 person types, same as the Mongoose
// model — most columns are only meaningful for one or two types (e.g.
// khetArea only for LANDOWNER), left NULL otherwise. Kept wide rather than
// split into per-type tables to match the existing shape 1:1 and avoid
// touching every controller that reads/writes these fields generically.
export const people = mysqlTable("people", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  type: varchar("type", { length: 50, enum: PERSON_TYPES }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 255 }),
  address: varchar("address", { length: 255 }),
  notes: text("notes"),
  status: varchar("status", { length: 50, enum: PERSON_STATUSES }).default("ACTIVE"),
  idNumber: varchar("idNumber", { length: 255 }),
  age: int("age"),
  sex: varchar("sex", { length: 50, enum: SEX_OPTIONS }),
  workType: varchar("workType", { length: 50, enum: WORK_TYPES }),
  dailyWage: double("dailyWage"),
  ratePerThousand: double("ratePerThousand"),
  contractorId: varchar("contractorId", { length: 64 }),
  familyHeadId: varchar("familyHeadId", { length: 64 }),
  payType: varchar("payType", { length: 50, enum: ["MONTHLY", "PER_THOUSAND"] }),
  commissionPerThousand: double("commissionPerThousand"),
  defaultRatePerThousand: double("defaultRatePerThousand"),
  bharaiRatePerThousand: double("bharaiRatePerThousand"),
  monthlySalary: double("monthlySalary"),
  stackingStage: varchar("stackingStage", { length: 50, enum: STACKING_STAGES }),
  bharaiContractorId: varchar("bharaiContractorId", { length: 64 }),
  nikasiContractorId: varchar("nikasiContractorId", { length: 64 }),
  firingShiftAnchorDate: dateColumn("firingShiftAnchorDate"),
  firingShiftAnchorType: varchar("firingShiftAnchorType", { length: 50, enum: ["DAY", "NIGHT"] }),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  licenseNumber: varchar("licenseNumber", { length: 255 }),
  ratePerTrolley: double("ratePerTrolley"),
  designation: varchar("designation", { length: 255 }),
  isOfficeStaff: boolean("isOfficeStaff").default(false),
  gstNumber: varchar("gstNumber", { length: 255 }),
  contractRate: double("contractRate"),
  contractUnit: varchar("contractUnit", { length: 255 }),
  profitSharePercent: double("profitSharePercent"),
  khetArea: double("khetArea"),
  khetAreaUnit: varchar("khetAreaUnit", { length: 50 }).default("bigha"),
  khetLocation: varchar("khetLocation", { length: 255 }),
  agreedDepthFeet: double("agreedDepthFeet"),
  creditLimit: double("creditLimit"),
  active: boolean("active").default(true),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnTypeIdx: index("people_kiln_type_idx").on(t.kilnId, t.type),
}));

export const FAMILY_RELATIONS = ["SPOUSE", "CHILD", "PARENT", "SIBLING", "OTHER"] as const;

export const familyMembers = mysqlTable("family_members", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  headPersonId: varchar("headPersonId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  relation: varchar("relation", { length: 50, enum: FAMILY_RELATIONS }).notNull(),
  age: int("age"),
  sex: varchar("sex", { length: 50, enum: SEX_OPTIONS }),
  isWorking: boolean("isWorking").default(false),
  workerId: varchar("workerId", { length: 64 }),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnHeadIdx: index("family_kiln_head_idx").on(t.kilnId, t.headPersonId),
}));

export const LEDGER_CATEGORIES = [
  "WAGE", "COMMISSION", "SALARY", "TIP", "ADVANCE", "KHARCHI", "MEDICAL",
  "FESTIVAL", "SALE", "SOIL", "FUEL", "OTHER",
] as const;
export const LEDGER_PAYMENT_MODES = ["CASH", "BANK", "UPI", "CASH_AND_ONLINE"] as const;

export const ledgerEntries = mysqlTable("ledger_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: varchar("personId", { length: 64 }).notNull(),
  direction: varchar("direction", { length: 50, enum: ["DUE", "PAID"] }).notNull(),
  amount: double("amount").notNull(),
  reason: text("reason").notNull(),
  category: varchar("category", { length: 50, enum: LEDGER_CATEGORIES }),
  paymentMode: varchar("paymentMode", { length: 50, enum: LEDGER_PAYMENT_MODES }),
  // Only set when paymentMode is CASH_AND_ONLINE — the two must sum to
  // `amount` (validated at the controller), so a split payment's cash vs.
  // online portions can still be reported on accurately elsewhere (e.g.
  // Financial Overview) instead of collapsing into one opaque label.
  cashAmount: double("cashAmount"),
  onlineAmount: double("onlineAmount"),
  contractId: varchar("contractId", { length: 64 }),
  date: dateColumn(),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnPersonDateIdx: index("ledger_kiln_person_date_idx").on(t.kilnId, t.personId, t.date),
}));

export const paymentReceipts = mysqlTable("payment_receipts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: varchar("personId", { length: 64 }).notNull(),
  receiptNumber: varchar("receiptNumber", { length: 255 }).notNull(),
  amountPaid: double("amountPaid").notNull(),
  totalAgreedAmount: double("totalAgreedAmount"),
  balanceBefore: double("balanceBefore").notNull(),
  balanceAfter: double("balanceAfter").notNull(),
  paymentMode: varchar("paymentMode", { length: 50, enum: LEDGER_PAYMENT_MODES }),
  cashAmount: double("cashAmount"),
  onlineAmount: double("onlineAmount"),
  notes: text("notes"),
  date: dateColumn(),
  createdAt: createdAtColumn(),
}, (t) => ({
  receiptNumberUnique: uniqueIndex("receipt_number_unique").on(t.receiptNumber),
  kilnDateIdx: index("receipt_kiln_date_idx").on(t.kilnId, t.date),
}));

export const workEntries = mysqlTable("work_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: varchar("personId", { length: 64 }).notNull(),
  workType: varchar("workType", { length: 50, enum: WORK_TYPES }).notNull(),
  quantity: double("quantity").notNull(),
  ratePerThousand: double("ratePerThousand").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("workentry_kiln_date_idx").on(t.kilnId, t.date),
}));

// A row here is always an *exception* — everyone is implicitly PRESENT on
// any date with no row (see attendance.service.ts). Only an admin-recorded
// Absent/Half-day/Late override ever gets written.
export const attendances = mysqlTable("attendances", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: varchar("personId", { length: 64 }).notNull(),
  date: dateColumn().notNull(),
  status: varchar("status", { length: 50, enum: ["PRESENT", "ABSENT", "HALF_DAY", "LATE"] }).notNull(),
  wageAmount: double("wageAmount"),
  createdAt: createdAtColumn(),
}, (t) => ({
  personDateUnique: uniqueIndex("attendance_person_date_unique").on(t.personId, t.date),
}));
