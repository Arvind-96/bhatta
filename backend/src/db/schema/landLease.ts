import { double, mysqlTable, varchar, text, datetime, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn } from "./_helpers";

// Land Lease (Patta) — copies Landowner's contract/rent tracking exactly
// (same rate-type options, same advance/ledger behavior, same detail-page
// shape) but kept as its own table rather than reusing soilContracts, so a
// Land Lease person's rent contract (this land is leased for raw-brick
// molding, not soil excavation) never shows up mixed into the Soil
// (Mitti) page's Contracts/Arrivals tabs. Deliberately does NOT track
// excavatedQuantity/depthUsed the way soilContracts does — those figures
// only make sense against SoilTrip/SoilArrival records, which Land Lease
// has no equivalent of.
export const LAND_LEASE_CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const LAND_LEASE_RATE_TYPES = ["PER_TROLLEY", "PER_BIGHA", "PER_DEPTH", "BOTH"] as const;
export const LAND_LEASE_DEPTH_UNITS = ["feet", "meter"] as const;

export const landLeaseContracts = mysqlTable("land_lease_contracts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractNumber: varchar("contractNumber", { length: 255 }).notNull(),
  landId: varchar("landId", { length: 64 }).notNull(),
  landLeaseId: varchar("landLeaseId", { length: 64 }).notNull(),
  rateType: varchar("rateType", { length: 50, enum: LAND_LEASE_RATE_TYPES }).default("PER_BIGHA"),
  contractedQuantity: double("contractedQuantity"),
  ratePerTrolley: double("ratePerTrolley"),
  contractedAreaBigha: double("contractedAreaBigha"),
  ratePerBigha: double("ratePerBigha"),
  contractedDepth: double("contractedDepth"),
  depthUnit: varchar("depthUnit", { length: 50, enum: LAND_LEASE_DEPTH_UNITS }).default("feet"),
  ratePerDepthUnit: double("ratePerDepthUnit"),
  totalContractValue: double("totalContractValue").notNull(),
  advanceAmount: double("advanceAmount").default(0),
  startDate: datetime("startDate", { mode: "date" }),
  endDate: datetime("endDate", { mode: "date" }),
  paymentTerms: text("paymentTerms"),
  status: varchar("status", { length: 50, enum: LAND_LEASE_CONTRACT_STATUSES }).default("ACTIVE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnContractNumberUnique: uniqueIndex("landlease_contract_kiln_number_unique").on(t.kilnId, t.contractNumber),
  kilnLandIdx: index("landlease_contract_kiln_land_idx").on(t.kilnId, t.landId),
  kilnLeaseIdx: index("landlease_contract_kiln_lease_idx").on(t.kilnId, t.landLeaseId),
}));
