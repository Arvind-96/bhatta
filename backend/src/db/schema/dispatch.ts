import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";
import { LEDGER_PAYMENT_MODES } from "./people";

export const BRICK_GRADES = ["A1", "JHAMA", "PELA"] as const;
export const DISPATCH_PAYMENT_MODES = ["CASH", "BANK", "UPI", "GST_INVOICE", "CASH_AND_ONLINE"] as const;

export const dispatches = sqliteTable("dispatches", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  customerName: text("customerName").notNull(),
  customerId: text("customerId"),
  grade: text("grade", { enum: BRICK_GRADES }).default("A1"),
  bricksCount: integer("bricksCount").notNull(),
  amount: real("amount").notNull(),
  driverId: text("driverId"),
  slipNumber: text("slipNumber").notNull(),
  invoiceNumber: text("invoiceNumber"),
  transportCost: real("transportCost"),
  transportPaidBy: text("transportPaidBy", { enum: ["OWNER", "CUSTOMER"] }),
  breakageCount: integer("breakageCount").default(0),
  returnedCount: integer("returnedCount").default(0),
  returnReason: text("returnReason"),
  paymentMode: text("paymentMode", { enum: DISPATCH_PAYMENT_MODES }),
  // Only set when paymentMode is CASH_AND_ONLINE — must sum to `amount`.
  cashAmount: real("cashAmount"),
  onlineAmount: real("onlineAmount"),
  dispatchedOn: dateColumn("dispatchedOn"),
  localId: text("localId"),
  createdAt: createdAtColumn(),
}, (t) => ({
  slipNumberUnique: uniqueIndex("dispatch_slip_unique").on(t.slipNumber),
  invoiceNumberUnique: uniqueIndex("dispatch_invoice_unique").on(t.invoiceNumber),
  localIdUnique: uniqueIndex("dispatch_localid_unique").on(t.localId),
  kilnDispatchedIdx: index("dispatch_kiln_dispatched_idx").on(t.kilnId, t.dispatchedOn),
}));

export const stockEntries = sqliteTable("stock_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  type: text("type", { enum: ["RAW_MATERIAL", "FINISHED_GOODS"] }).notNull(),
  itemName: text("itemName").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").default("units"),
  recordedOn: dateColumn("recordedOn"),
  localId: text("localId"),
  version: integer("version").default(1),
  createdAt: createdAtColumn(),
}, (t) => ({
  localIdUnique: uniqueIndex("stockentry_localid_unique").on(t.localId),
  kilnTypeIdx: index("stockentry_kiln_type_idx").on(t.kilnId, t.type),
}));

export const stockAudits = sqliteTable("stock_audits", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  itemName: text("itemName").notNull(),
  registerCount: real("registerCount").notNull(),
  physicalCount: real("physicalCount").notNull(),
  variance: real("variance").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stockaudit_kiln_date_idx").on(t.kilnId, t.date) }));

export const stockLoadingEntries = sqliteTable("stock_loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  categoryId: text("categoryId").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stockloading_kiln_date_idx").on(t.kilnId, t.date) }));

export const EXPENSE_CATEGORIES = [
  "JCB_RENTAL", "ROYALTY_CHALLAN", "TUBEWELL_DIESEL", "TUBEWELL_ELECTRICITY", "WATER",
  "MOLD_SAND", "TARPAULIN", "LABOR_COLONY", "LOCAL_CHANDA", "PETTY_CASH",
  "MACHINERY_REPAIR", "DRIVER_BHATTA", "POLICE_CHALLAN", "COMMISSION_DALALI", "TRANSIT_TAX", "OTHER",
] as const;

export const expenses = sqliteTable("expenses", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  amount: real("amount").notNull(),
  // A single mode label is enough here (unlike dispatches/ledger entries) —
  // expenses aren't customer-facing bills that get split payments, this
  // just powers the Financial Overview's cash/online breakdown.
  paymentMode: text("paymentMode", { enum: LEDGER_PAYMENT_MODES }),
  hours: real("hours"),
  date: dateColumn(),
  notes: text("notes"),
  soilTripId: text("soilTripId"),
  incidentId: text("incidentId"),
  dispatchId: text("dispatchId"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("expense_kiln_date_idx").on(t.kilnId, t.date),
  kilnCategoryIdx: index("expense_kiln_category_idx").on(t.kilnId, t.category),
}));

export const COMPLIANCE_DOCUMENT_TYPES = [
  "PCB_CONSENT_TO_OPERATE", "MINING_ROYALTY_LICENSE", "ZIG_ZAG_CERTIFICATE",
  "ENVIRONMENTAL_CLEARANCE", "OTHER",
] as const;

export const complianceDocuments = sqliteTable("compliance_documents", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  documentType: text("documentType", { enum: COMPLIANCE_DOCUMENT_TYPES }).notNull(),
  title: text("title").notNull(),
  issueDate: integer("issueDate", { mode: "timestamp_ms" }),
  expiryDate: dateColumn("expiryDate").notNull(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnExpiryIdx: index("compliance_kiln_expiry_idx").on(t.kilnId, t.expiryDate) }));
