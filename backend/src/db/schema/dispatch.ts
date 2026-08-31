import { double, int, json, mysqlTable, varchar, text, datetime, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn, itemsColumn, SIMPLE_PAYMENT_MODES } from "./_helpers";

export const BRICK_GRADES = ["A1", "JHAMA", "PELA"] as const;
export const DISPATCH_PAYMENT_MODES = ["CASH", "BANK", "UPI", "GST_INVOICE", "CASH_AND_ONLINE"] as const;

export const dispatches = mysqlTable("dispatches", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  // Multi-category breakdown — see BrickLineItem's doc comment in
  // _helpers.ts. categoryId/bricksCount/amount above stay the aggregate.
  items: itemsColumn(),
  // Print-only fields for the Gate Pass/Challan — auto-populated from the
  // originating brickLoadingEntries row when this dispatch was created by
  // the Brick Loading auto-sync; otherwise settable directly on a manual
  // dispatch.
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 255 }),
  driverTipAmount: double("driverTipAmount"),
  // How the Driver Reward above was paid — independent of this dispatch's
  // own paymentMode/cashAmount/onlineAmount (that set is unused now, see
  // the comment above; this set is for the tip specifically). Pre-filled
  // from the originating Brick Loading trip's own tipPaymentMode/
  // tipCashAmount/tipOnlineAmount when this dispatch is auto-created by
  // linking a trip (see createDispatch), same as driverTipAmount itself.
  driverTipPaymentMode: varchar("driverTipPaymentMode", { length: 20, enum: SIMPLE_PAYMENT_MODES }),
  driverTipCashAmount: double("driverTipCashAmount"),
  driverTipOnlineAmount: double("driverTipOnlineAmount"),
  // Stored purely for transparent display on the Challan ("gross − discount
  // = net"); `amount` above is already the net, post-discount figure so
  // every downstream revenue total keeps working unchanged.
  discountAmount: double("discountAmount"),
  // The delivery address for this dispatch's bricks — auto-filled
  // (editable) from a linked Brick Loading trip's own placeOfSupply,
  // otherwise settable directly. Carried onto any Challan/Gate
  // Pass/Invoice generated from this dispatch.
  placeOfSupply: varchar("placeOfSupply", { length: 255 }),
  notes: text("notes"),
  dispatchedOn: dateColumn("dispatchedOn"),
  localId: varchar("localId", { length: 64 }),
  createdAt: createdAtColumn(),
}, (t) => ({
  // Scoped to (kilnId, seasonId, slipNumber), not slipNumber alone — the
  // slip number is now a human-readable per-kiln document number
  // ("JVS-16-08-2026-01"), deterministic from the kiln's name/date/daily-
  // sequence, so two different kilns (e.g. two same-named ones under one
  // account) can legitimately land on the identical-looking text without
  // colliding — and seasonId means slip numbering restarts each season.
  slipNumberUnique: uniqueIndex("dispatch_slip_unique").on(t.kilnId, t.seasonId, t.slipNumber),
  // Scoped to (kilnId, seasonId, invoiceNumber), not invoiceNumber alone —
  // becoming a plain per-kiln sequential counter ("61") means two different
  // kilns' Nth invoice would otherwise collide under a global constraint,
  // the same class of bug already fixed for slipNumber above.
  invoiceNumberUnique: uniqueIndex("dispatch_invoice_unique").on(t.kilnId, t.seasonId, t.invoiceNumber),
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
// brickLoading.service.ts's generateTripNumber. Nullable — the Create form
// pre-fills the suggested next number but the admin can clear it and save
// blank; MAX() over a nullable column already ignores NULL rows, so a
// blank save doesn't advance/consume the sequence (the same number is
// suggested again next time). The (kilnId, sequenceNumber) unique index
// below still holds with multiple NULLs per kiln — MySQL treats NULLs as
// distinct from each other in a unique index.
export const challans = mysqlTable("challans", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  dispatchId: varchar("dispatchId", { length: 64 }).notNull(),
  sequenceNumber: int("sequenceNumber"),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 255 }),
  driverName: varchar("driverName", { length: 255 }),
  driverPhone: varchar("driverPhone", { length: 255 }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerAddress: varchar("customerAddress", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  categoryId: varchar("categoryId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  // Multi-category breakdown (no pricing here, same as categoryId/
  // bricksCount above) — see BrickLineItem's doc comment in _helpers.ts.
  items: itemsColumn(),
  placeOfSupply: varchar("placeOfSupply", { length: 255 }),
  challanDate: dateColumn("challanDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDispatchIdx: index("challan_kiln_dispatch_idx").on(t.kilnId, t.dispatchId),
  sequenceUnique: uniqueIndex("challan_kiln_sequence_unique").on(t.kilnId, t.seasonId, t.sequenceNumber),
}));

export const gatePasses = mysqlTable("gate_passes", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  dispatchId: varchar("dispatchId", { length: 64 }).notNull(),
  sequenceNumber: int("sequenceNumber"),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 255 }),
  driverName: varchar("driverName", { length: 255 }),
  driverPhone: varchar("driverPhone", { length: 255 }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  categoryId: varchar("categoryId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  // Multi-category breakdown (no pricing here, same as categoryId/
  // bricksCount above) — see BrickLineItem's doc comment in _helpers.ts.
  items: itemsColumn(),
  placeOfSupply: varchar("placeOfSupply", { length: 255 }),
  gatePassDate: dateColumn("gatePassDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDispatchIdx: index("gatepass_kiln_dispatch_idx").on(t.kilnId, t.dispatchId),
  sequenceUnique: uniqueIndex("gatepass_kiln_sequence_unique").on(t.kilnId, t.seasonId, t.sequenceNumber),
}));

export const invoices = mysqlTable("invoices", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  // Nullable — set when this sale is attributed to a PARTNER and/or a
  // SALES_AGENT (see partner.service.ts/salesAgent.service.ts). Drives two
  // things: a pending due on this invoice posts a PARTNER_DUE ledger entry
  // to partnerId (the kiln recovers it from the partner directly, not the
  // customer), and netAmount/bricksCount post a COMMISSION ledger entry to
  // agentId per that agent's own commission basis. Both independent of one
  // another — an invoice can have either, both, or neither.
  partnerId: varchar("partnerId", { length: 64 }),
  agentId: varchar("agentId", { length: 64 }),
  sequenceNumber: int("sequenceNumber"),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerAddress: varchar("customerAddress", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  customerGstNumber: varchar("customerGstNumber", { length: 255 }),
  // Free text, e.g. "RJ-08" — matches customerGstNumber's own free-text
  // convention (not decomposed/validated), shown verbatim on the printed
  // invoice next to the customer's GSTIN.
  customerStateCode: varchar("customerStateCode", { length: 255 }),
  // Auto-filled from the originating Dispatch's own vehicleNumber (still
  // editable) — same "snapshot, then independently editable" convention as
  // customerAddress/customerPhone below.
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  // GST breakdown — print-only, never affects netAmount/ledger math (see
  // printInvoiceRecord). Left null = no GST section on the printed
  // invoice at all, matching a kiln that isn't GST-registered.
  gstRatePercent: double("gstRatePercent"),
  gstType: varchar("gstType", { length: 20, enum: ["CGST_SGST", "IGST"] }),
  // Indian financial year (Apr–Mar), e.g. "26-27", computed once from
  // invoiceDate at creation and frozen — together with sessionSerialNumber
  // below, forms the printed invoice number ({kilnPrefix}/{session}/
  // {sessionSerialNumber}). Deliberately separate from the pre-existing
  // sequenceNumber/"Serial Number" field (unique per kiln, never
  // session-scoped) so Challan/Gate Pass numbering and this kiln's
  // existing invoice serial history are completely unaffected.
  session: varchar("session", { length: 20 }),
  sessionSerialNumber: int("sessionSerialNumber"),
  // Snapshot of kilns.defaultTermsAndConditions at creation time, editable
  // per invoice from then on — same convention as customerAddress.
  termsAndConditions: text("termsAndConditions"),
  categoryId: varchar("categoryId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  // Multi-category breakdown — see BrickLineItem's doc comment in
  // _helpers.ts. categoryId/bricksCount/ratePerBrick/grossAmount/netAmount
  // stay the aggregate for every read path that doesn't yet know `items`.
  items: itemsColumn(),
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
  placeOfSupply: varchar("placeOfSupply", { length: 255 }),
  invoiceDate: dateColumn("invoiceDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDispatchIdx: index("invoice_kiln_dispatch_idx").on(t.kilnId, t.dispatchId),
  kilnCustomerIdx: index("invoice_kiln_customer_idx").on(t.kilnId, t.customerId),
  sequenceUnique: uniqueIndex("invoice_kiln_sequence_unique").on(t.kilnId, t.seasonId, t.sequenceNumber),
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
  // Backstop for createCustomer's own findCustomerByName check below —
  // same pattern as expenseTypes' kilnNameUnique. Two customers sharing a
  // name in one kiln would make listInvoicesForCustomer's customerId-IS-
  // NULL name-fallback match ambiguous, double-counting a legacy invoice's
  // paid/due on both profiles.
  kilnNameUnique: uniqueIndex("customer_kiln_name_unique").on(t.kilnId, t.name),
}));

export const stockEntries = mysqlTable("stock_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
  categoryId: varchar("categoryId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stockloading_kiln_date_idx").on(t.kilnId, t.date) }));

// Legacy fixed categorization — superseded by the free-form expenseTypes
// table below (admin-extensible, matching the Customer feature's dropdown
// pattern), but kept so historical rows created under the old system keep
// their original label. New rows leave this null and are categorized
// purely via expenseTypeId instead.
export const EXPENSE_CATEGORIES = [
  "JCB_RENTAL", "ROYALTY_CHALLAN", "TUBEWELL_DIESEL", "TUBEWELL_ELECTRICITY", "WATER",
  "MOLD_SAND", "TARPAULIN", "LABOR_COLONY", "LOCAL_CHANDA", "PETTY_CASH",
  "MACHINERY_REPAIR", "DRIVER_BHATTA", "POLICE_CHALLAN", "COMMISSION_DALALI", "TRANSIT_TAX", "OTHER",
] as const;

// The admin-extensible dropdown list for the Expense page — the "Add
// Expense Type" free-text field on the Add Expense form auto-creates one
// of these the first time a name is typed that doesn't already match, the
// same find-or-create-by-name pattern used for Customer profiles from the
// Brick Loading form (see customer.service.ts's findCustomerByName). Total
// Paid/Total Due are never stored here — always recomputed live from
// openingPaid/openingDue plus every expense row's own amount (see
// expenseType.service.ts's getExpenseTypeDetail), the same "opening
// balance + live recomputation" pattern as the Customer feature's
// openingPaid/openingDue. Every expense logged under a type is treated as
// a pure payment (there's no separate "new charge" concept for expenses,
// unlike a Customer's invoices) — it always adds to paid and subtracts
// from due, exactly like a Customer's Add Amount / general payment.
export const expenseTypes = mysqlTable("expense_types", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  openingPaid: double("openingPaid").notNull().default(0),
  openingDue: double("openingDue").notNull().default(0),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnIdx: index("expensetype_kiln_idx").on(t.kilnId),
  kilnNameUnique: uniqueIndex("expensetype_kiln_name_unique").on(t.kilnId, t.name),
}));

export const expenses = mysqlTable("expenses", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  // Nullable now — see the EXPENSE_CATEGORIES comment above; new rows use
  // expenseTypeId instead.
  category: varchar("category", { length: 50, enum: EXPENSE_CATEGORIES }),
  expenseTypeId: varchar("expenseTypeId", { length: 64 }),
  amount: double("amount").notNull(),
  // Only meaningful for the Gas Cylinder expense type (quantity of
  // cylinders) — left null for every other type.
  quantity: double("quantity"),
  // CASH_AND_ONLINE here means what it means everywhere else in this app —
  // split across cashAmount/onlineAmount below, which must sum to `amount`.
  // The three auto-logged Brick Loading costs (Driver Reward/Loading/
  // Unloading Charge) carry their own paymentMode/split straight over from
  // the trip's own tipPaymentMode/loadingPaymentMode/unloadingPaymentMode
  // (see autoLogExpense); a manually-added expense can set this directly.
  paymentMode: varchar("paymentMode", { length: 20, enum: SIMPLE_PAYMENT_MODES }),
  cashAmount: double("cashAmount"),
  onlineAmount: double("onlineAmount"),
  hours: double("hours"),
  // Transaction Date — the actual date the payment was made (admin-set,
  // editable). System Entry Date (the date logged into the software,
  // always "today", read-only) is `createdAt` below — no separate column
  // needed since createdAtColumn() already captures exactly that.
  date: dateColumn(),
  notes: text("notes"),
  soilTripId: varchar("soilTripId", { length: 64 }),
  incidentId: varchar("incidentId", { length: 64 }),
  dispatchId: varchar("dispatchId", { length: 64 }),
  // Set only for the three auto-logged rows a Brick Loading trip creates
  // (Driver Reward/Inam, Loading Charge, Unloading Charge) — lets
  // deleteBrickLoadingEntry find and remove exactly those rows again,
  // instead of the free-text `notes` string ("Trip #12") being the only
  // link back to the trip.
  brickLoadingEntryId: varchar("brickLoadingEntryId", { length: 64 }),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("expense_kiln_date_idx").on(t.kilnId, t.date),
  kilnCategoryIdx: index("expense_kiln_category_idx").on(t.kilnId, t.category),
  kilnExpenseTypeIdx: index("expense_kiln_expensetype_idx").on(t.kilnId, t.expenseTypeId),
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
