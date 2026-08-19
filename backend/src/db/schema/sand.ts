import { double, int, json, mysqlTable, varchar, text, datetime, uniqueIndex, index, boolean } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

// A deliberately separate module from the Soil/Land/Contract system
// (soil.ts) — a Sand Contractor isn't tied to a Land parcel the way a
// Landowner is, and its rate basis (per trolley delivered, or a lump sum
// tied to 1000-brick output) doesn't fit soil's bigha/depth model. Kept
// fully independent so nothing here can affect the already-live Landowner
// data in soil_contracts/soil_arrivals.
export const SAND_CONTRACT_RATE_TYPES = ["PER_TROLLEY", "PER_THOUSAND_BRICKS"] as const;

export const sandContracts = mysqlTable("sand_contracts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractNumber: varchar("contractNumber", { length: 255 }).notNull(),
  sandContractorId: varchar("sandContractorId", { length: 64 }).notNull(),
  rateType: varchar("rateType", { length: 50, enum: SAND_CONTRACT_RATE_TYPES }).default("PER_TROLLEY"),
  // Only meaningful for PER_TROLLEY — how many trolleys this contract
  // covers. PER_THOUSAND_BRICKS is a lump-sum agreement with no physical
  // quantity cap to track here.
  contractedTrolleys: double("contractedTrolleys"),
  // The agreed rate per unit (per trolley, or per 1000 bricks, depending
  // on rateType) — shown back on the contractor's profile alongside the
  // lump-sum totalContractValue below, which stays independently
  // admin-entered rather than derived from this rate.
  contractPrice: double("contractPrice"),
  totalContractValue: double("totalContractValue").notNull(),
  advanceAmount: double("advanceAmount").default(0),
  startDate: datetime("startDate", { mode: "date" }),
  endDate: datetime("endDate", { mode: "date" }),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnContractNumberUnique: uniqueIndex("sand_contract_kiln_number_unique").on(t.kilnId, t.contractNumber),
  kilnContractorIdx: index("sand_contract_kiln_contractor_idx").on(t.kilnId, t.sandContractorId),
}));

export interface SandDeliveryTractorEntry {
  driverName?: string;
  driverPhone?: string;
  tractorNumber?: string;
}

// The trolley-delivery log against a sand contractor (and optionally one
// of their contracts) — same multi-tractor shape as soil_arrivals'
// `tractors` column (see soil.ts), since multiple tractors can run a
// delivery simultaneously here too.
export const sandDeliveries = mysqlTable("sand_deliveries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  sandContractorId: varchar("sandContractorId", { length: 64 }).notNull(),
  contractId: varchar("contractId", { length: 64 }),
  tractorUsed: boolean("tractorUsed").default(false),
  tractors: json("tractors").$type<SandDeliveryTractorEntry[]>(),
  trolleyCount: int("trolleyCount").notNull(),
  paymentGiven: double("paymentGiven").default(0),
  paymentPending: double("paymentPending").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("sanddelivery_kiln_date_idx").on(t.kilnId, t.date) }));
