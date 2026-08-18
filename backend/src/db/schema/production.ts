import { double, int, mysqlTable, varchar, text, datetime, uniqueIndex, index, boolean } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";
import { STACKING_STAGES } from "./people";

export const GHER_STATUSES = ["EMPTY", "STACKING", "FIRING", "READY"] as const;

export const ghers = mysqlTable("ghers", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  number: int("number").notNull(),
  status: varchar("status", { length: 50, enum: GHER_STATUSES }).default("EMPTY"),
  cycleStartedAt: datetime("cycleStartedAt", { mode: "date" }),
  updatedAt: datetime("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
}, (t) => ({
  kilnNumberUnique: uniqueIndex("gher_kiln_number_unique").on(t.kilnId, t.number),
}));

export const moldingEntries = mysqlTable("molding_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  workerId: varchar("workerId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  ratePerThousand: double("ratePerThousand").notNull(),
  damagedCount: int("damagedCount").default(0),
  date: dateColumn(),
  washedOut: boolean("washedOut").default(false),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("molding_kiln_date_idx").on(t.kilnId, t.date) }));

export const STACKING_MODES = ["BUGGI", "TRACTOR"] as const;
export const STACKING_QUALITY = ["GOOD", "AVERAGE", "POOR"] as const;

export const stackingEntries = mysqlTable("stacking_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  gangId: varchar("gangId", { length: 64 }).notNull(),
  stage: varchar("stage", { length: 50, enum: STACKING_STAGES }),
  bricksCount: int("bricksCount").notNull(),
  damageCount: int("damageCount").default(0),
  ratePerThousand: double("ratePerThousand"),
  qualityRating: varchar("qualityRating", { length: 50, enum: STACKING_QUALITY }).default("GOOD"),
  mode: varchar("mode", { length: 50, enum: STACKING_MODES }),
  tractorNumber: varchar("tractorNumber", { length: 255 }),
  buggiCount: int("buggiCount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stacking_kiln_date_idx").on(t.kilnId, t.date) }));

export const STACKING_VEHICLE_TYPES = ["TRACTOR", "BUGGI"] as const;
export const STACKING_VEHICLE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const stackingVehicles = mysqlTable("stacking_vehicles", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractorId: varchar("contractorId", { length: 64 }).notNull(),
  vehicleType: varchar("vehicleType", { length: 50, enum: STACKING_VEHICLE_TYPES }).notNull(),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  buggiCount: int("buggiCount"),
  driverName: varchar("driverName", { length: 255 }),
  status: varchar("status", { length: 50, enum: STACKING_VEHICLE_STATUSES }).default("ACTIVE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnContractorIdx: index("stackveh_kiln_contractor_idx").on(t.kilnId, t.contractorId) }));

export const chamberGradings = mysqlTable("chamber_gradings", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  a1Count: int("a1Count").notNull().default(0),
  jhamaCount: int("jhamaCount").notNull().default(0),
  pelaCount: int("pelaCount").notNull().default(0),
  rodaCount: int("rodaCount").notNull().default(0),
  stackedCount: int("stackedCount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("grading_kiln_date_idx").on(t.kilnId, t.date) }));

export const SHIFT_TYPES = ["DAY", "NIGHT"] as const;

export const firingShifts = mysqlTable("firing_shifts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  fitterId: varchar("fitterId", { length: 64 }).notNull(),
  gherId: varchar("gherId", { length: 64 }),
  shiftType: varchar("shiftType", { length: 50, enum: SHIFT_TYPES }).notNull(),
  handoverNotes: text("handoverNotes"),
  overtimeHours: double("overtimeHours").default(0),
  overtimeRate: double("overtimeRate"),
  bonusAmount: double("bonusAmount").default(0),
  date: dateColumn(),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("firingshift_kiln_date_idx").on(t.kilnId, t.date) }));

export const fireMovementLogs = mysqlTable("fire_movement_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  gherNumber: int("gherNumber").notNull(),
  startedAt: datetime("startedAt", { mode: "date" }).$defaultFn(() => new Date()),
}, (t) => ({ kilnStartedIdx: index("firemove_kiln_started_idx").on(t.kilnId, t.startedAt) }));

export const INCIDENT_TYPES = ["CRACK_LEAKAGE", "WEATHER_FLOODING", "ELECTRICAL_FAILURE", "OTHER"] as const;

export const kilnIncidents = mysqlTable("kiln_incidents", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: varchar("gherId", { length: 64 }),
  type: varchar("type", { length: 50, enum: INCIDENT_TYPES }).notNull(),
  description: text("description").notNull(),
  repairCost: double("repairCost").default(0),
  bricksLost: int("bricksLost").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("incident_kiln_date_idx").on(t.kilnId, t.date) }));

export const nikasiEntries = mysqlTable("nikasi_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  gangId: varchar("gangId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  damagedCount: int("damagedCount").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("nikasi_kiln_date_idx").on(t.kilnId, t.date) }));

export const loadingEntries = mysqlTable("loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  dispatchId: varchar("dispatchId", { length: 64 }),
  palledarId: varchar("palledarId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  ratePerThousand: double("ratePerThousand").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("loadingentry_kiln_date_idx").on(t.kilnId, t.date) }));

export const BRICK_VEHICLE_TYPES = ["TRUCK", "TRACTOR"] as const;

export const brickLoadingEntries = mysqlTable("brick_loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  vehicleType: varchar("vehicleType", { length: 50, enum: BRICK_VEHICLE_TYPES }).notNull(),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }).notNull(),
  driverId: varchar("driverId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  tipAmount: double("tipAmount").default(0),
  loadingCharge: double("loadingCharge"),
  // Which brick category was loaded — drives the auto-created Dispatch's
  // amount (bricksCount * that category's pricePerBrick). See
  // brickLoading.service.ts.
  categoryId: varchar("categoryId", { length: 64 }),
  dispatchId: varchar("dispatchId", { length: 64 }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("brickloading_kiln_date_idx").on(t.kilnId, t.date) }));

// Free-form, admin-defined — not a fixed vocabulary. The kiln can name
// categories however it wants; the only constraint is no duplicate name
// within one kiln (see the unique index below).
export const brickCategories = mysqlTable("brick_categories", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  category: varchar("category", { length: 255 }).notNull(),
  // Free-form too, same philosophy as `category` itself — e.g. "A1",
  // "Second Class", or whatever this kiln calls its own grades. Shown
  // alongside the category name everywhere a category is displayed
  // (Stock, Brick Loading, Dispatch, Gate Pass/Challan).
  grade: varchar("grade", { length: 255 }),
  quantity: int("quantity").default(0),
  pricePerBrick: double("pricePerBrick").default(0),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnCategoryUnique: uniqueIndex("brickcat_kiln_category_unique").on(t.kilnId, t.category) }));

export const brickProductionEntries = mysqlTable("brick_production_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  categoryId: varchar("categoryId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("brickprod_kiln_date_idx").on(t.kilnId, t.date) }));

export const productionLogs = mysqlTable("production_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  batchNumber: varchar("batchNumber", { length: 255 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  qualityGrade: varchar("qualityGrade", { length: 50 }).default("A"),
  producedOn: dateColumn("producedOn"),
  thekedarId: varchar("thekedarId", { length: 64 }),
  localId: varchar("localId", { length: 64 }),
  version: int("version").default(1),
  createdAt: createdAtColumn(),
}, (t) => ({
  localIdUnique: uniqueIndex("productionlog_localid_unique").on(t.localId),
  kilnProducedIdx: index("productionlog_kiln_produced_idx").on(t.kilnId, t.producedOn),
}));

export const WASTAGE_TYPES = ["SOIL", "KACCHI_BRICK"] as const;
export const WASTAGE_CAUSES = ["RAIN", "TRANSPORT", "OTHER"] as const;

export const wastageLogs = mysqlTable("wastage_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  type: varchar("type", { length: 50, enum: WASTAGE_TYPES }).notNull(),
  cause: varchar("cause", { length: 50, enum: WASTAGE_CAUSES }).notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 50 }).default("trolley"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("wastage_kiln_date_idx").on(t.kilnId, t.date) }));
