import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";
import { STACKING_STAGES } from "./people";

export const GHER_STATUSES = ["EMPTY", "STACKING", "FIRING", "READY"] as const;

export const ghers = sqliteTable("ghers", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  number: integer("number").notNull(),
  status: text("status", { enum: GHER_STATUSES }).default("EMPTY"),
  cycleStartedAt: integer("cycleStartedAt", { mode: "timestamp_ms" }),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
}, (t) => ({
  kilnNumberUnique: uniqueIndex("gher_kiln_number_unique").on(t.kilnId, t.number),
}));

export const moldingEntries = sqliteTable("molding_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  workerId: text("workerId").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  ratePerThousand: real("ratePerThousand").notNull(),
  damagedCount: integer("damagedCount").default(0),
  date: dateColumn(),
  washedOut: integer("washedOut", { mode: "boolean" }).default(false),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("molding_kiln_date_idx").on(t.kilnId, t.date) }));

export const STACKING_MODES = ["BUGGI", "TRACTOR"] as const;
export const STACKING_QUALITY = ["GOOD", "AVERAGE", "POOR"] as const;

export const stackingEntries = sqliteTable("stacking_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: text("gherId").notNull(),
  gangId: text("gangId").notNull(),
  stage: text("stage", { enum: STACKING_STAGES }),
  bricksCount: integer("bricksCount").notNull(),
  damageCount: integer("damageCount").default(0),
  ratePerThousand: real("ratePerThousand"),
  qualityRating: text("qualityRating", { enum: STACKING_QUALITY }).default("GOOD"),
  mode: text("mode", { enum: STACKING_MODES }),
  tractorNumber: text("tractorNumber"),
  buggiCount: integer("buggiCount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("stacking_kiln_date_idx").on(t.kilnId, t.date) }));

export const STACKING_VEHICLE_TYPES = ["TRACTOR", "BUGGI"] as const;
export const STACKING_VEHICLE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const stackingVehicles = sqliteTable("stacking_vehicles", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  contractorId: text("contractorId").notNull(),
  vehicleType: text("vehicleType", { enum: STACKING_VEHICLE_TYPES }).notNull(),
  vehicleNumber: text("vehicleNumber"),
  buggiCount: integer("buggiCount"),
  driverName: text("driverName"),
  status: text("status", { enum: STACKING_VEHICLE_STATUSES }).default("ACTIVE"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnContractorIdx: index("stackveh_kiln_contractor_idx").on(t.kilnId, t.contractorId) }));

export const chamberGradings = sqliteTable("chamber_gradings", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: text("gherId").notNull(),
  a1Count: integer("a1Count").notNull().default(0),
  jhamaCount: integer("jhamaCount").notNull().default(0),
  pelaCount: integer("pelaCount").notNull().default(0),
  rodaCount: integer("rodaCount").notNull().default(0),
  stackedCount: integer("stackedCount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("grading_kiln_date_idx").on(t.kilnId, t.date) }));

export const SHIFT_TYPES = ["DAY", "NIGHT"] as const;

export const firingShifts = sqliteTable("firing_shifts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  fitterId: text("fitterId").notNull(),
  gherId: text("gherId"),
  shiftType: text("shiftType", { enum: SHIFT_TYPES }).notNull(),
  handoverNotes: text("handoverNotes"),
  overtimeHours: real("overtimeHours").default(0),
  overtimeRate: real("overtimeRate"),
  bonusAmount: real("bonusAmount").default(0),
  date: dateColumn(),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("firingshift_kiln_date_idx").on(t.kilnId, t.date) }));

export const fireMovementLogs = sqliteTable("fire_movement_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: text("gherId").notNull(),
  gherNumber: integer("gherNumber").notNull(),
  startedAt: integer("startedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
}, (t) => ({ kilnStartedIdx: index("firemove_kiln_started_idx").on(t.kilnId, t.startedAt) }));

export const INCIDENT_TYPES = ["CRACK_LEAKAGE", "WEATHER_FLOODING", "ELECTRICAL_FAILURE", "OTHER"] as const;

export const kilnIncidents = sqliteTable("kiln_incidents", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: text("gherId"),
  type: text("type", { enum: INCIDENT_TYPES }).notNull(),
  description: text("description").notNull(),
  repairCost: real("repairCost").default(0),
  bricksLost: integer("bricksLost").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("incident_kiln_date_idx").on(t.kilnId, t.date) }));

export const nikasiEntries = sqliteTable("nikasi_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: text("gherId").notNull(),
  gangId: text("gangId").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  damagedCount: integer("damagedCount").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("nikasi_kiln_date_idx").on(t.kilnId, t.date) }));

export const loadingEntries = sqliteTable("loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  dispatchId: text("dispatchId"),
  palledarId: text("palledarId").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  ratePerThousand: real("ratePerThousand").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("loadingentry_kiln_date_idx").on(t.kilnId, t.date) }));

export const BRICK_VEHICLE_TYPES = ["TRUCK", "TRACTOR"] as const;

export const brickLoadingEntries = sqliteTable("brick_loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  vehicleType: text("vehicleType", { enum: BRICK_VEHICLE_TYPES }).notNull(),
  vehicleNumber: text("vehicleNumber").notNull(),
  driverId: text("driverId").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  tipAmount: real("tipAmount").default(0),
  loadingCharge: real("loadingCharge"),
  // Which brick category was loaded — drives the auto-created Dispatch's
  // amount (bricksCount * that category's pricePerBrick). See
  // brickLoading.service.ts.
  categoryId: text("categoryId"),
  dispatchId: text("dispatchId"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("brickloading_kiln_date_idx").on(t.kilnId, t.date) }));

// Free-form, admin-defined — not a fixed vocabulary. The kiln can name
// categories however it wants; the only constraint is no duplicate name
// within one kiln (see the unique index below).
export const brickCategories = sqliteTable("brick_categories", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  category: text("category").notNull(),
  quantity: integer("quantity").default(0),
  pricePerBrick: real("pricePerBrick").default(0),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnCategoryUnique: uniqueIndex("brickcat_kiln_category_unique").on(t.kilnId, t.category) }));

export const brickProductionEntries = sqliteTable("brick_production_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  categoryId: text("categoryId").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("brickprod_kiln_date_idx").on(t.kilnId, t.date) }));

export const productionLogs = sqliteTable("production_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  batchNumber: text("batchNumber").notNull(),
  bricksCount: integer("bricksCount").notNull(),
  qualityGrade: text("qualityGrade").default("A"),
  producedOn: dateColumn("producedOn"),
  thekedarId: text("thekedarId"),
  localId: text("localId"),
  version: integer("version").default(1),
  createdAt: createdAtColumn(),
}, (t) => ({
  localIdUnique: uniqueIndex("productionlog_localid_unique").on(t.localId),
  kilnProducedIdx: index("productionlog_kiln_produced_idx").on(t.kilnId, t.producedOn),
}));

export const WASTAGE_TYPES = ["SOIL", "KACCHI_BRICK"] as const;
export const WASTAGE_CAUSES = ["RAIN", "TRANSPORT", "OTHER"] as const;

export const wastageLogs = sqliteTable("wastage_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  type: text("type", { enum: WASTAGE_TYPES }).notNull(),
  cause: text("cause", { enum: WASTAGE_CAUSES }).notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").default("trolley"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("wastage_kiln_date_idx").on(t.kilnId, t.date) }));
