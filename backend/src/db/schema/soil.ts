import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const LAND_STATUSES = [
  "AVAILABLE", "UNDER_CONTRACT", "EXCAVATION_IN_PROGRESS", "EXHAUSTED",
  "CONTRACT_COMPLETED", "INACTIVE",
] as const;

export const lands = sqliteTable("lands", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landownerId: text("landownerId").notNull(),
  name: text("name").notNull(),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district"),
  state: text("state"),
  khasraNumber: text("khasraNumber"),
  khataNumber: text("khataNumber"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  area: real("area"),
  areaUnit: text("areaUnit").default("bigha"),
  soilType: text("soilType"),
  estimatedSoilQuantity: real("estimatedSoilQuantity"),
  status: text("status", { enum: LAND_STATUSES }).default("AVAILABLE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnOwnerIdx: index("land_kiln_owner_idx").on(t.kilnId, t.landownerId) }));

export const soilTrips = sqliteTable("soil_trips", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landownerId: text("landownerId").notNull(),
  driverId: text("driverId"),
  contractId: text("contractId"),
  landId: text("landId"),
  tractorNumber: text("tractorNumber"),
  trolleyCount: integer("trolleyCount").default(1),
  receivedTrolleyCount: integer("receivedTrolleyCount"),
  ratePerTrolley: real("ratePerTrolley").notNull(),
  driverRatePerTrolley: real("driverRatePerTrolley"),
  depthFeet: real("depthFeet"),
  status: text("status", { enum: ["ARRIVED", "WEATHERING", "READY"] }).default("ARRIVED"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("soiltrip_kiln_date_idx").on(t.kilnId, t.date) }));

export const SOIL_CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const SOIL_CONTRACT_RATE_TYPES = ["PER_TROLLEY", "PER_BIGHA", "PER_DEPTH"] as const;
export const DEPTH_UNITS = ["feet", "meter"] as const;

export const soilContracts = sqliteTable("soil_contracts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractNumber: text("contractNumber").notNull(),
  landId: text("landId").notNull(),
  landownerId: text("landownerId").notNull(),
  soilType: text("soilType"),
  rateType: text("rateType", { enum: SOIL_CONTRACT_RATE_TYPES }).default("PER_TROLLEY"),
  contractedQuantity: real("contractedQuantity"),
  ratePerTrolley: real("ratePerTrolley"),
  contractedAreaBigha: real("contractedAreaBigha"),
  ratePerBigha: real("ratePerBigha"),
  contractedDepth: real("contractedDepth"),
  depthUnit: text("depthUnit", { enum: DEPTH_UNITS }).default("feet"),
  ratePerDepthUnit: real("ratePerDepthUnit"),
  totalContractValue: real("totalContractValue").notNull(),
  advanceAmount: real("advanceAmount").default(0),
  startDate: integer("startDate", { mode: "timestamp_ms" }),
  endDate: integer("endDate", { mode: "timestamp_ms" }),
  agreedDepthFeet: real("agreedDepthFeet"),
  paymentTerms: text("paymentTerms"),
  status: text("status", { enum: SOIL_CONTRACT_STATUSES }).default("ACTIVE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnContractNumberUnique: uniqueIndex("contract_kiln_number_unique").on(t.kilnId, t.contractNumber),
  kilnLandIdx: index("contract_kiln_land_idx").on(t.kilnId, t.landId),
  kilnOwnerIdx: index("contract_kiln_owner_idx").on(t.kilnId, t.landownerId),
}));

export const soilArrivals = sqliteTable("soil_arrivals", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landownerId: text("landownerId").notNull(),
  contractId: text("contractId"),
  jcbUsed: integer("jcbUsed", { mode: "boolean" }).default(false),
  tractorUsed: integer("tractorUsed", { mode: "boolean" }).default(false),
  jcbDriverId: text("jcbDriverId"),
  tractorDriverId: text("tractorDriverId"),
  trolleyCount: integer("trolleyCount").notNull(),
  depthFeet: real("depthFeet"),
  paymentGiven: real("paymentGiven").default(0),
  paymentPending: real("paymentPending").default(0),
  soilRemaining: real("soilRemaining"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("soilarrival_kiln_date_idx").on(t.kilnId, t.date) }));

export const jcbWorkLogs = sqliteTable("jcb_work_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landId: text("landId").notNull(),
  landownerId: text("landownerId").notNull(),
  machineId: text("machineId"),
  driverId: text("driverId").notNull(),
  contractId: text("contractId"),
  hoursWorked: real("hoursWorked").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("jcbwork_kiln_date_idx").on(t.kilnId, t.date),
  kilnLandIdx: index("jcbwork_kiln_land_idx").on(t.kilnId, t.landId),
}));
