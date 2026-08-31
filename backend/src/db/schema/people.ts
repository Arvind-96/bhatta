import { double, int, mysqlTable, varchar, text, uniqueIndex, index, boolean, datetime } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const PERSON_TYPES = [
  "DRIVER", "LABOUR_CONTRACTOR", "SUPPLIER", "THEKEDAR", "PARTNER", "WORKER",
  "HELPER", "LANDOWNER", "FITTER", "CUSTOMER", "MUNIM", "CHOWKIDAR", "SAND_CONTRACTOR",
  "SALES_AGENT", "LAND_LEASE",
] as const;
export const AGENT_COMMISSION_TYPES = ["PERCENT_OF_SALE", "PER_THOUSAND_BRICKS"] as const;
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
  pakayiContractorId: varchar("pakayiContractorId", { length: 64 }),
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
  // PARTNER only — the date they formally joined as a profit-sharing
  // partner (distinct from `joiningDate`, which is a general staff-join
  // concept used elsewhere). Admin-set, no default — same shape as
  // joiningDate, deliberately NOT dateColumn() (which auto-defaults to
  // "now"; correct for firingShiftAnchorDate, wrong here — an unset
  // partnership date should stay unset, not silently become today).
  partnershipDate: datetime("partnershipDate", { mode: "date" }),
  profitSharePercent: double("profitSharePercent"),
  // SALES_AGENT only — which of the two commission bases this agent is
  // paid on. commissionPercent (of an invoice's netAmount) when
  // PERCENT_OF_SALE; the pre-existing commissionPerThousand column (bricks
  // sold, not molded — same column LABOUR_CONTRACTOR already uses for its
  // own unrelated per-1000 commission) when PER_THOUSAND_BRICKS.
  commissionType: varchar("commissionType", { length: 30, enum: AGENT_COMMISSION_TYPES }),
  commissionPercent: double("commissionPercent"),
  // SALES_AGENT only — an optional monthly sales-value goal (₹), shown as
  // a progress bar against that agent's actual current-month sales on
  // their detail page. Null = no target tracked for this agent.
  monthlySalesTarget: double("monthlySalesTarget"),
  // SALES_AGENT only — a short admin-set code the agent can hand out /
  // customers can mention, so a sale can be attributed to them even before
  // the munim looks the agent up by name. Purely a reference string — this
  // app has no public/customer-facing surface for it to actually link to.
  referralCode: varchar("referralCode", { length: 100 }),
  khetArea: double("khetArea"),
  khetAreaUnit: varchar("khetAreaUnit", { length: 50 }).default("bigha"),
  khetLocation: varchar("khetLocation", { length: 255 }),
  agreedDepthFeet: double("agreedDepthFeet"),
  // Unit the admin actually entered agreedDepthFeet in — the column name
  // is a historical holdover from before this existed; the figure itself
  // may be in feet or meters depending on this field.
  agreedDepthUnit: varchar("agreedDepthUnit", { length: 50 }).default("feet"),
  // Sequential per-kiln display number for landowners only ("Landowner -
  // N") — set once at creation (see person.service.ts's createPerson),
  // never reassigned. Null for every other person type.
  landownerSerial: int("landownerSerial"),
  // Same idea as landownerSerial above, but for sand contractors ("Sand -
  // N") — independent counter, null for every other person type.
  sandContractorSerial: int("sandContractorSerial"),
  // Same idea again, but for Land Lease (Patta) — a person type that
  // copies Landowner's functionality exactly (land holdings + a
  // soil-contract-shaped rent contract, always tracked in Bigha) for land
  // leased for raw-brick molding rather than soil excavation. Independent
  // counter ("Land Lease - N"), null for every other person type.
  landLeaseSerial: int("landLeaseSerial"),
  creditLimit: double("creditLimit"),
  active: boolean("active").default(true),
  // What everyone actually calls this person day-to-day — distinct from
  // `name` (the formal/legal name used on ledgers, slips, and receipts).
  nickname: varchar("nickname", { length: 255 }),
  // Admin-set, no default — same shape as firingShiftAnchorDate above.
  joiningDate: datetime("joiningDate", { mode: "date" }),
  // Server-relative file paths under DATA_DIR/people/<personId>/ — see
  // person.service.ts's savePersonPhoto/savePersonIdentityProof. Never
  // served via a static mount; always through an explicit kiln-scoped
  // GET route, same convention as salary.service.ts's PDF paths.
  photoPath: varchar("photoPath", { length: 512 }),
  identityProofPath: varchar("identityProofPath", { length: 512 }),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnTypeIdx: index("people_kiln_type_idx").on(t.kilnId, t.type),
}));

// One row per Pathai session for a LABOUR_CONTRACTOR (Thekedar) -- the
// admin-entered terms ("Number of laborers", "Fare per laborer", "Advance
// per laborer") that drive the "Total Amount Payable by Admin" formula
// (see labourSession.service.ts). Only one row per (kilnId, contractorId)
// has endDate NULL at a time -- that's the "current" session; closing it
// (starting a new one) stamps endDate and its final payable total becomes
// the next row's carriedForwardAmount, per the admin's carry-forward
// request. Ledger deductions (advance/kharchi/medical/festival to the gang,
// advance to the contractor) are never stored here -- they're derived live
// from ledgerEntries, scoped to [startDate, endDate).
export const labourSessions = mysqlTable("labour_sessions", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractorId: varchar("contractorId", { length: 64 }).notNull(),
  numberOfLaborers: int("numberOfLaborers").notNull().default(0),
  farePerLaborer: double("farePerLaborer").notNull().default(0),
  advancePerLaborer: double("advancePerLaborer").notNull().default(0),
  carriedForwardAmount: double("carriedForwardAmount").notNull().default(0),
  startDate: dateColumn("startDate"),
  endDate: datetime("endDate", { mode: "date" }),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnContractorIdx: index("labour_session_kiln_contractor_idx").on(t.kilnId, t.contractorId),
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

export const PARTNER_ASSET_TYPES = ["VEHICLE", "LAND", "OTHER"] as const;

// What a PARTNER has actually contributed to the kiln — a vehicle, a
// parcel of land, or something else — one row per item, since a partner
// can contribute more than one (unlike LANDOWNER's single khetArea/
// khetLocation pair on the person row itself). Deliberately NOT
// season-scoped: a contributed asset is an ongoing fact about the
// partnership, not a per-season transaction, same reasoning as `people`
// itself never carrying a seasonId.
export const partnerAssets = mysqlTable("partner_assets", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  partnerId: varchar("partnerId", { length: 64 }).notNull(),
  assetType: varchar("assetType", { length: 20, enum: PARTNER_ASSET_TYPES }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  // Land-specific — null for VEHICLE/OTHER.
  landAreaBigha: double("landAreaBigha"),
  // What the kiln owes the partner for this asset's use, and over what
  // period ("per month", "per trip", "per season", free text) — null on
  // either means "contributed free of charge, no rent tracked."
  rentalRate: double("rentalRate"),
  rentalRateUnit: varchar("rentalRateUnit", { length: 100 }),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnPartnerIdx: index("partner_asset_kiln_partner_idx").on(t.kilnId, t.partnerId),
}));

export const LEDGER_CATEGORIES = [
  "WAGE", "COMMISSION", "SALARY", "TIP", "ADVANCE", "KHARCHI", "MEDICAL",
  "FESTIVAL", "SALE", "SOIL", "SAND", "FUEL", "FARE", "OTHER", "PARTNER_DUE",
] as const;
export const LEDGER_PAYMENT_MODES = ["CASH", "BANK", "UPI", "CASH_AND_ONLINE"] as const;

export const ledgerEntries = mysqlTable("ledger_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
  personId: varchar("personId", { length: 64 }).notNull(),
  date: dateColumn().notNull(),
  status: varchar("status", { length: 50, enum: ["PRESENT", "ABSENT", "HALF_DAY", "LATE"] }).notNull(),
  wageAmount: double("wageAmount"),
  createdAt: createdAtColumn(),
}, (t) => ({
  personDateUnique: uniqueIndex("attendance_person_date_unique").on(t.personId, t.date),
}));
