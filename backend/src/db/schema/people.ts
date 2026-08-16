import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const PERSON_TYPES = [
  "DRIVER", "LABOUR_CONTRACTOR", "SUPPLIER", "THEKEDAR", "PARTNER", "WORKER",
  "HELPER", "LANDOWNER", "FITTER", "CUSTOMER", "MUNIM", "CHOWKIDAR",
] as const;
export const WORK_TYPES = [
  "PATHAI", "BHARAI_TRANSPORT", "PAKAYI", "NIKASI", "LOADING", "BHARAI_CHAMBER_STACKING",
] as const;
export const SEX_OPTIONS = ["MALE", "FEMALE", "OTHER"] as const;
export const PERSON_STATUSES = ["ACTIVE", "ABSCONDED"] as const;
export const STACKING_STAGES = ["TRANSPORT", "CHAMBER_STACKING"] as const;

// Single-table-inheritance across 12 person types, same as the Mongoose
// model — most columns are only meaningful for one or two types (e.g.
// khetArea only for LANDOWNER), left NULL otherwise. Kept wide rather than
// split into per-type tables to match the existing shape 1:1 and avoid
// touching every controller that reads/writes these fields generically.
export const people = sqliteTable("people", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  type: text("type", { enum: PERSON_TYPES }).notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  status: text("status", { enum: PERSON_STATUSES }).default("ACTIVE"),
  idNumber: text("idNumber"),
  age: integer("age"),
  sex: text("sex", { enum: SEX_OPTIONS }),
  workType: text("workType", { enum: WORK_TYPES }),
  dailyWage: real("dailyWage"),
  ratePerThousand: real("ratePerThousand"),
  contractorId: text("contractorId"),
  familyHeadId: text("familyHeadId"),
  payType: text("payType", { enum: ["MONTHLY", "PER_THOUSAND"] }),
  commissionPerThousand: real("commissionPerThousand"),
  defaultRatePerThousand: real("defaultRatePerThousand"),
  bharaiRatePerThousand: real("bharaiRatePerThousand"),
  monthlySalary: real("monthlySalary"),
  stackingStage: text("stackingStage", { enum: STACKING_STAGES }),
  bharaiContractorId: text("bharaiContractorId"),
  nikasiContractorId: text("nikasiContractorId"),
  faceDescriptor: text("faceDescriptor", { mode: "json" }).$type<number[]>(),
  firingShiftAnchorDate: integer("firingShiftAnchorDate", { mode: "timestamp_ms" }),
  firingShiftAnchorType: text("firingShiftAnchorType", { enum: ["DAY", "NIGHT"] }),
  vehicleNumber: text("vehicleNumber"),
  licenseNumber: text("licenseNumber"),
  ratePerTrolley: real("ratePerTrolley"),
  designation: text("designation"),
  isOfficeStaff: integer("isOfficeStaff", { mode: "boolean" }).default(false),
  gstNumber: text("gstNumber"),
  contractRate: real("contractRate"),
  contractUnit: text("contractUnit"),
  profitSharePercent: real("profitSharePercent"),
  khetArea: real("khetArea"),
  khetAreaUnit: text("khetAreaUnit").default("bigha"),
  khetLocation: text("khetLocation"),
  agreedDepthFeet: real("agreedDepthFeet"),
  creditLimit: real("creditLimit"),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnTypeIdx: index("people_kiln_type_idx").on(t.kilnId, t.type),
}));

export const FAMILY_RELATIONS = ["SPOUSE", "CHILD", "PARENT", "SIBLING", "OTHER"] as const;

export const familyMembers = sqliteTable("family_members", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  headPersonId: text("headPersonId").notNull(),
  name: text("name").notNull(),
  relation: text("relation", { enum: FAMILY_RELATIONS }).notNull(),
  age: integer("age"),
  sex: text("sex", { enum: SEX_OPTIONS }),
  isWorking: integer("isWorking", { mode: "boolean" }).default(false),
  workerId: text("workerId"),
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

export const ledgerEntries = sqliteTable("ledger_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: text("personId").notNull(),
  direction: text("direction", { enum: ["DUE", "PAID"] }).notNull(),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  category: text("category", { enum: LEDGER_CATEGORIES }),
  paymentMode: text("paymentMode", { enum: LEDGER_PAYMENT_MODES }),
  // Only set when paymentMode is CASH_AND_ONLINE — the two must sum to
  // `amount` (validated at the controller), so a split payment's cash vs.
  // online portions can still be reported on accurately elsewhere (e.g.
  // Financial Overview) instead of collapsing into one opaque label.
  cashAmount: real("cashAmount"),
  onlineAmount: real("onlineAmount"),
  contractId: text("contractId"),
  date: dateColumn(),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnPersonDateIdx: index("ledger_kiln_person_date_idx").on(t.kilnId, t.personId, t.date),
}));

export const paymentReceipts = sqliteTable("payment_receipts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: text("personId").notNull(),
  receiptNumber: text("receiptNumber").notNull(),
  amountPaid: real("amountPaid").notNull(),
  totalAgreedAmount: real("totalAgreedAmount"),
  balanceBefore: real("balanceBefore").notNull(),
  balanceAfter: real("balanceAfter").notNull(),
  paymentMode: text("paymentMode", { enum: LEDGER_PAYMENT_MODES }),
  cashAmount: real("cashAmount"),
  onlineAmount: real("onlineAmount"),
  notes: text("notes"),
  date: dateColumn(),
  createdAt: createdAtColumn(),
}, (t) => ({
  receiptNumberUnique: uniqueIndex("receipt_number_unique").on(t.receiptNumber),
  kilnDateIdx: index("receipt_kiln_date_idx").on(t.kilnId, t.date),
}));

export const workEntries = sqliteTable("work_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: text("personId").notNull(),
  workType: text("workType", { enum: WORK_TYPES }).notNull(),
  quantity: real("quantity").notNull(),
  ratePerThousand: real("ratePerThousand").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("workentry_kiln_date_idx").on(t.kilnId, t.date),
}));

// A row here is always an *exception* — everyone is implicitly PRESENT on
// any date with no row (see attendance.service.ts's computeStatusForRange).
// Only Absent/Half-day/Late overrides, or a kiosk-verified PRESENT check-in,
// ever get written.
export const attendances = sqliteTable("attendances", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: text("personId").notNull(),
  date: dateColumn().notNull(),
  status: text("status", { enum: ["PRESENT", "ABSENT", "HALF_DAY", "LATE"] }).notNull(),
  wageAmount: real("wageAmount"),
  createdAt: createdAtColumn(),
}, (t) => ({
  personDateUnique: uniqueIndex("attendance_person_date_unique").on(t.personId, t.date),
}));
