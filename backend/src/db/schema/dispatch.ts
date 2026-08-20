import { double, int, json, mysqlTable, varchar, text, datetime, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";
import { LEDGER_PAYMENT_MODES } from "./people";

export const BRICK_GRADES = ["A1", "JHAMA", "PELA"] as const;
export const DISPATCH_PAYMENT_MODES = ["CASH", "BANK", "UPI", "GST_INVOICE", "CASH_AND_ONLINE"] as const;

export const dispatches = mysqlTable("dispatches", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerId: varchar("customerId", { length: 64 }),
  // Snapshot of the client's address/phone at sale time — printed on the
  // Gate Pass/Challan even for a walk-in name with no linked customerId,
  // and stays correct on old documents even if a linked customer's own
  // Person record is edited later. Auto-filled (editable) from the picked
  // customer on the Log Dispatch form; blank for legacy rows.
  customerAddress: varchar("customerAddress", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  grade: varchar("grade", { length: 50, enum: BRICK_GRADES }).default("A1"),
  bricksCount: int("bricksCount").notNull(),
  amount: double("amount").notNull(),
  driverId: varchar("driverId", { length: 64 }),
  // Plain text driver identity — replaced driverId-Person-selection on the
  // Log Dispatch form (driverId/driverTipAmount never had any ledger
  // effect either way, see dispatch.service.ts). driverId itself stays
  // nullable for legacy rows and Gate Pass fallback display.
  driverName: varchar("driverName", { length: 255 }),
  driverPhone: varchar("driverPhone", { length: 255 }),
  slipNumber: varchar("slipNumber", { length: 255 }).notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 255 }),
  transportCost: double("transportCost"),
  transportPaidBy: varchar("transportPaidBy", { length: 50, enum: ["OWNER", "CUSTOMER"] }),
  breakageCount: int("breakageCount").default(0),
  returnedCount: int("returnedCount").default(0),
  returnReason: text("returnReason"),
  paymentMode: varchar("paymentMode", { length: 50, enum: DISPATCH_PAYMENT_MODES }),
  // Only set when paymentMode is CASH_AND_ONLINE — must sum to `amount`.
  cashAmount: double("cashAmount"),
  onlineAmount: double("onlineAmount"),
  // Which free-form brick category this dispatch moved — independent of
  // `grade` (a separate, older fixed A1/JHAMA/PELA classification). Set
  // automatically on dispatches auto-created from a Brick Loading trip;
  // left null on manually-created dispatches.
  categoryId: varchar("categoryId", { length: 64 }),
  // Print-only fields for the Gate Pass/Challan — auto-populated from the
  // originating brickLoadingEntries row when this dispatch was created by
  // the Brick Loading auto-sync; otherwise settable directly on a manual
  // dispatch.
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 255 }),
  driverTipAmount: double("driverTipAmount"),
  // Stored purely for transparent display on the Challan ("gross − discount
  // = net"); `amount` above is already the net, post-discount figure so
  // every downstream revenue total keeps working unchanged.
  discountAmount: double("discountAmount"),
  notes: text("notes"),
  dispatchedOn: dateColumn("dispatchedOn"),
  localId: varchar("localId", { length: 64 }),
  createdAt: createdAtColumn(),
}, (t) => ({
  // Scoped to (kilnId, slipNumber), not slipNumber alone — the slip number
  // is now a human-readable per-kiln document number ("JVS-16-08-2026-01"),
  // deterministic from the kiln's name/date/daily-sequence, so two
  // different kilns (e.g. two same-named ones under one account) can
  // legitimately land on the identical-looking text without colliding.
  slipNumberUnique: uniqueIndex("dispatch_slip_unique").on(t.kilnId, t.slipNumber),
  // Scoped to (kilnId, invoiceNumber), not invoiceNumber alone — becoming a
  // plain per-kiln sequential counter ("61") means two different kilns'
  // Nth invoice would otherwise collide under a global constraint, the
  // same class of bug already fixed for slipNumber above.
  invoiceNumberUnique: uniqueIndex("dispatch_invoice_unique").on(t.kilnId, t.invoiceNumber),
  localIdUnique: uniqueIndex("dispatch_localid_unique").on(t.localId),
  kilnDispatchedIdx: index("dispatch_kiln_dispatched_idx").on(t.kilnId, t.dispatchedOn),
}));

// Three genuinely distinct documents an admin can generate from a Dispatch
// record's own detail page (see dispatchDocuments.service.ts) — separate
// from the ad-hoc printGatePass/printInvoice functions the older
// GatePass.tsx/Billing.tsx pages already use directly off `dispatches`
// (those are untouched, zero risk of regression). Each row here is its
// own editable, deletable record with fields specific to that document,
// not a live view of the dispatch: a Challan is a delivery note with no
// pricing, a Gate Pass is the exit-authorization slip, an Invoice is the
// priced/GST commercial bill. `sequenceNumber` is a plain per-kiln
// counter, generated MAX-based (see generateSequenceNumber) rather than
// COUNT-based, to avoid the exact collision-after-delete bug fixed in
// brickLoading.service.ts's generateTripNumber.
export const challans = mysqlTable("challans", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  dispatchId: varchar("dispatchId", { length: 64 }).notNull(),
  sequenceNumber: int("sequenceNumber").notNull(),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 255 }),
  driverName: varchar("driverName", { length: 255 }),
  driverPhone: varchar("driverPhone", { length: 255 }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerAddress: varchar("customerAddress", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  categoryId: varchar("categoryId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  challanDate: dateColumn("challanDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDispatchIdx: index("challan_kiln_dispatch_idx").on(t.kilnId, t.dispatchId),
  sequenceUnique: uniqueIndex("challan_kiln_sequence_unique").on(t.kilnId, t.sequenceNumber),
}));

export const gatePasses = mysqlTable("gate_passes", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  dispatchId: varchar("dispatchId", { length: 64 }).notNull(),
  sequenceNumber: int("sequenceNumber").notNull(),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 255 }),
  driverName: varchar("driverName", { length: 255 }),
  driverPhone: varchar("driverPhone", { length: 255 }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  categoryId: varchar("categoryId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  gatePassDate: dateColumn("gatePassDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDispatchIdx: index("gatepass_kiln_dispatch_idx").on(t.kilnId, t.dispatchId),
  sequenceUnique: uniqueIndex("gatepass_kiln_sequence_unique").on(t.kilnId, t.sequenceNumber),
}));

export const invoices = mysqlTable("invoices", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  // Nullable — an invoice generated from a customer's own profile page
  // (a general/advance payment via "Add Amount", or a sale logged
  // directly against a Customer record) has no originating Dispatch.
  dispatchId: varchar("dispatchId", { length: 64 }),
  // Links to `customers` below — set whenever this invoice was created
  // from a Customer's own profile page (Add Amount, or a Customer-aware
  // Create Invoice). Left null for invoices created from a Dispatch's
  // detail page, which predates the Customer feature and only knows a
  // plain customerName snapshot; getCustomerDetail's balance/invoice-list
  // queries match on customerId OR (customerId IS NULL AND a matching
  // customerName), so pre-existing Dispatch-linked invoices still surface
  // under a same-named Customer without needing a data migration.
  customerId: varchar("customerId", { length: 64 }),
  sequenceNumber: int("sequenceNumber").notNull(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerAddress: varchar("customerAddress", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  customerGstNumber: varchar("customerGstNumber", { length: 255 }),
  categoryId: varchar("categoryId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  ratePerBrick: double("ratePerBrick"),
  grossAmount: double("grossAmount"),
  discountAmount: double("discountAmount"),
  netAmount: double("netAmount").notNull(),
  // How much of `netAmount` is actually being paid at invoice time — the
  // rest becomes this customer's due balance (see
  // customer.service.ts:getCustomerDetail). Nullable and defaults to
  // `netAmount` (fully paid) wherever unset, so every invoice created
  // before this field existed keeps reading as fully settled, matching
  // its old behavior.
  amountPaidNow: double("amountPaidNow"),
  paymentMode: varchar("paymentMode", { length: 50, enum: DISPATCH_PAYMENT_MODES }),
  cashAmount: double("cashAmount"),
  onlineAmount: double("onlineAmount"),
  invoiceDate: dateColumn("invoiceDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDispatchIdx: index("invoice_kiln_dispatch_idx").on(t.kilnId, t.dispatchId),
  kilnCustomerIdx: index("invoice_kiln_customer_idx").on(t.kilnId, t.customerId),
  sequenceUnique: uniqueIndex("invoice_kiln_sequence_unique").on(t.kilnId, t.sequenceNumber),
}));

// Every phone/address/driver/vehicle a customer might have — plain JSON
// arrays rather than four normalized child tables, since nothing here
// needs its own independent id/lifecycle beyond "belongs to this
// customer" (no per-row edit history, no other table references a single
// phone/driver/vehicle by id). openingPaid/openingDue are the balances
// entered when the customer record is first created (e.g. onboarding an
// existing customer with prior history); getCustomerDetail adds every
// linked invoice's paid/due contribution on top of these two, live, on
// every read -- never stored/cached, so it can never drift out of sync
// with the invoices themselves.
export const customers = mysqlTable("customers", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  phones: json("phones").$type<string[]>().default([]),
  addresses: json("addresses").$type<string[]>().default([]),
  drivers: json("drivers").$type<{ name: string; phone: string; address: string }[]>().default([]),
  vehicles: json("vehicles").$type<{ vehicleType: string; vehicleNumber: string }[]>().default([]),
  openingPaid: double("openingPaid").notNull().default(0),
  openingDue: double("openingDue").notNull().default(0),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnIdx: index("customer_kiln_idx").on(t.kilnId),
}));

export const stockEntries = mysqlTable("stock_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  type: varchar("type", { length: 50, enum: ["RAW_MATERIAL", "FINISHED_GOODS"] }).notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 50 }).default("units"),
  recordedOn: dateColumn("recordedOn"),
  localId: varchar("localId", { length: 64 }),
  version: int("version").default(1),
  createdAt: createdAtColumn(),
}, (t) => ({
  localIdUnique: uniqueIndex("stockentry_localid_unique").on(t.localId),
  kilnTypeIdx: index("stockentry_kiln_type_idx").on(t.kilnId, t.type),
}));

export const stockAudits = mysqlTable("stock_audits", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  registerCount: double("registerCount").notNull(),
  physicalCount: double("physicalCount").notNull(),
  variance: double("variance").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stockaudit_kiln_date_idx").on(t.kilnId, t.date) }));

export const stockLoadingEntries = mysqlTable("stock_loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  categoryId: varchar("categoryId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stockloading_kiln_date_idx").on(t.kilnId, t.date) }));

export const EXPENSE_CATEGORIES = [
  "JCB_RENTAL", "ROYALTY_CHALLAN", "TUBEWELL_DIESEL", "TUBEWELL_ELECTRICITY", "WATER",
  "MOLD_SAND", "TARPAULIN", "LABOR_COLONY", "LOCAL_CHANDA", "PETTY_CASH",
  "MACHINERY_REPAIR", "DRIVER_BHATTA", "POLICE_CHALLAN", "COMMISSION_DALALI", "TRANSIT_TAX", "OTHER",
] as const;

export const expenses = mysqlTable("expenses", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  category: varchar("category", { length: 50, enum: EXPENSE_CATEGORIES }).notNull(),
  amount: double("amount").notNull(),
  // A single mode label is enough here (unlike dispatches/ledger entries) —
  // expenses aren't customer-facing bills that get split payments, this
  // just powers the Financial Overview's cash/online breakdown.
  paymentMode: varchar("paymentMode", { length: 50, enum: LEDGER_PAYMENT_MODES }),
  hours: double("hours"),
  date: dateColumn(),
  notes: text("notes"),
  soilTripId: varchar("soilTripId", { length: 64 }),
  incidentId: varchar("incidentId", { length: 64 }),
  dispatchId: varchar("dispatchId", { length: 64 }),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("expense_kiln_date_idx").on(t.kilnId, t.date),
  kilnCategoryIdx: index("expense_kiln_category_idx").on(t.kilnId, t.category),
}));

export const COMPLIANCE_DOCUMENT_TYPES = [
  "PCB_CONSENT_TO_OPERATE", "MINING_ROYALTY_LICENSE", "ZIG_ZAG_CERTIFICATE",
  "ENVIRONMENTAL_CLEARANCE", "OTHER",
] as const;

export const complianceDocuments = mysqlTable("compliance_documents", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  documentType: varchar("documentType", { length: 50, enum: COMPLIANCE_DOCUMENT_TYPES }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  issueDate: datetime("issueDate", { mode: "date" }),
  expiryDate: dateColumn("expiryDate").notNull(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnExpiryIdx: index("compliance_kiln_expiry_idx").on(t.kilnId, t.expiryDate) }));
