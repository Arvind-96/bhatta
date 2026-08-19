import { double, int, mysqlTable, varchar, text, datetime, uniqueIndex, index, boolean } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const LAND_STATUSES = [
  "AVAILABLE", "UNDER_CONTRACT", "EXCAVATION_IN_PROGRESS", "EXHAUSTED",
  "CONTRACT_COMPLETED", "INACTIVE",
] as const;

export const lands = mysqlTable("lands", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landownerId: varchar("landownerId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  village: varchar("village", { length: 255 }),
  tehsil: varchar("tehsil", { length: 255 }),
  district: varchar("district", { length: 255 }),
  state: varchar("state", { length: 255 }),
  khasraNumber: varchar("khasraNumber", { length: 255 }),
  khataNumber: varchar("khataNumber", { length: 255 }),
  latitude: double("latitude"),
  longitude: double("longitude"),
  area: double("area"),
  areaUnit: varchar("areaUnit", { length: 50 }).default("bigha"),
  soilType: varchar("soilType", { length: 255 }),
  estimatedSoilQuantity: double("estimatedSoilQuantity"),
  status: varchar("status", { length: 50, enum: LAND_STATUSES }).default("AVAILABLE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnOwnerIdx: index("land_kiln_owner_idx").on(t.kilnId, t.landownerId) }));

export const soilTrips = mysqlTable("soil_trips", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landownerId: varchar("landownerId", { length: 64 }).notNull(),
  driverId: varchar("driverId", { length: 64 }),
  contractId: varchar("contractId", { length: 64 }),
  landId: varchar("landId", { length: 64 }),
  tractorNumber: varchar("tractorNumber", { length: 255 }),
  trolleyCount: int("trolleyCount").default(1),
  receivedTrolleyCount: int("receivedTrolleyCount"),
  ratePerTrolley: double("ratePerTrolley").notNull(),
  driverRatePerTrolley: double("driverRatePerTrolley"),
  depthFeet: double("depthFeet"),
  status: varchar("status", { length: 50, enum: ["ARRIVED", "WEATHERING", "READY"] }).default("ARRIVED"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("soiltrip_kiln_date_idx").on(t.kilnId, t.date) }));

export const SOIL_CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const SOIL_CONTRACT_RATE_TYPES = ["PER_TROLLEY", "PER_BIGHA", "PER_DEPTH", "BOTH"] as const;
export const DEPTH_UNITS = ["feet", "meter"] as const;

export const soilContracts = mysqlTable("soil_contracts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractNumber: varchar("contractNumber", { length: 255 }).notNull(),
  landId: varchar("landId", { length: 64 }).notNull(),
  landownerId: varchar("landownerId", { length: 64 }).notNull(),
  soilType: varchar("soilType", { length: 255 }),
  rateType: varchar("rateType", { length: 50, enum: SOIL_CONTRACT_RATE_TYPES }).default("PER_TROLLEY"),
  contractedQuantity: double("contractedQuantity"),
  ratePerTrolley: double("ratePerTrolley"),
  contractedAreaBigha: double("contractedAreaBigha"),
  ratePerBigha: double("ratePerBigha"),
  contractedDepth: double("contractedDepth"),
  depthUnit: varchar("depthUnit", { length: 50, enum: DEPTH_UNITS }).default("feet"),
  ratePerDepthUnit: double("ratePerDepthUnit"),
  totalContractValue: double("totalContractValue").notNull(),
  advanceAmount: double("advanceAmount").default(0),
  startDate: datetime("startDate", { mode: "date" }),
  endDate: datetime("endDate", { mode: "date" }),
  agreedDepthFeet: double("agreedDepthFeet"),
  paymentTerms: text("paymentTerms"),
  status: varchar("status", { length: 50, enum: SOIL_CONTRACT_STATUSES }).default("ACTIVE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnContractNumberUnique: uniqueIndex("contract_kiln_number_unique").on(t.kilnId, t.contractNumber),
  kilnLandIdx: index("contract_kiln_land_idx").on(t.kilnId, t.landId),
  kilnOwnerIdx: index("contract_kiln_owner_idx").on(t.kilnId, t.landownerId),
}));

export const soilArrivals = mysqlTable("soil_arrivals", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landownerId: varchar("landownerId", { length: 64 }).notNull(),
  contractId: varchar("contractId", { length: 64 }),
  jcbUsed: boolean("jcbUsed").default(false),
  tractorUsed: boolean("tractorUsed").default(false),
  jcbDriverId: varchar("jcbDriverId", { length: 64 }),
  tractorDriverId: varchar("tractorDriverId", { length: 64 }),
  trolleyCount: int("trolleyCount").notNull(),
  depthFeet: double("depthFeet"),
  paymentGiven: double("paymentGiven").default(0),
  paymentPending: double("paymentPending").default(0),
  soilRemaining: double("soilRemaining"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("soilarrival_kiln_date_idx").on(t.kilnId, t.date) }));

export const jcbWorkLogs = mysqlTable("jcb_work_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  landId: varchar("landId", { length: 64 }).notNull(),
  landownerId: varchar("landownerId", { length: 64 }).notNull(),
  machineId: varchar("machineId", { length: 64 }),
  driverId: varchar("driverId", { length: 64 }).notNull(),
  contractId: varchar("contractId", { length: 64 }),
  hoursWorked: double("hoursWorked").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("jcbwork_kiln_date_idx").on(t.kilnId, t.date),
  kilnLandIdx: index("jcbwork_kiln_land_idx").on(t.kilnId, t.landId),
}));
