import { double, int, mysqlTable, varchar, text, datetime, uniqueIndex, index, boolean } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn, itemsColumn, SIMPLE_PAYMENT_MODES } from "./_helpers";
import { STACKING_STAGES } from "./people";

// UNLOADING sits between READY (fired, waiting to be opened) and EMPTY
// (finalized) — the admin advances a chamber into it once nikasi/unloading
// labor starts, and it's chamber grading's own createChamberGrading that
// takes it the rest of the way to EMPTY (finalizing the categorized output
// into real brick-category stock), same as READY→EMPTY used to happen
// automatically before this status existed.
export const GHER_STATUSES = ["EMPTY", "STACKING", "FIRING", "READY", "UNLOADING"] as const;

// Who's responsible for a damage count logged on a Molding/Stacking/Nikasi
// entry — admin-set, optional (most entries have no damage at all). Kept as
// a single shared enum across all three tables rather than per-table
// variants since the meaning is identical everywhere it appears.
export const DAMAGE_FAULT_OPTIONS = ["LABOURER", "CONTRACTOR", "OTHER"] as const;

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

// One row per firing cycle a chamber goes through — inserted on transition
// to STACKING (see gher.service.ts's updateGherStatus), timestamps filled
// in as the chamber advances, completedAt set on transition back to EMPTY.
// ghers.cycleStartedAt only ever tracks the CURRENT cycle and gets
// overwritten every time a new one starts; this table is what makes a
// historical "which cycle was this" report possible (Nikasi Round/Gher
// Wise Cross Check). stackedSinceForGher/fuelConsumedForGher/
// unloadedSinceForGher (stacking/fuelLog/nikasi services) already take a
// plain `since?: Date` param, so a completed cycle's own
// stackingStartedAt/unloadingStartedAt can be passed straight in unchanged.
export const gherCycles = mysqlTable("gher_cycles", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  cycleNumber: int("cycleNumber").notNull(),
  stackingStartedAt: datetime("stackingStartedAt", { mode: "date" }),
  firingStartedAt: datetime("firingStartedAt", { mode: "date" }),
  readyAt: datetime("readyAt", { mode: "date" }),
  unloadingStartedAt: datetime("unloadingStartedAt", { mode: "date" }),
  completedAt: datetime("completedAt", { mode: "date" }),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnGherIdx: index("ghercycle_kiln_gher_idx").on(t.kilnId, t.gherId),
  gherCycleUnique: uniqueIndex("ghercycle_gher_cyclenum_unique").on(t.gherId, t.cycleNumber),
}));

// A physical molding ground (Pathai site) — the kiln's own yard, or a
// separate remote site soil gets trucked to for raw-brick molding. Same
// shape/role as `ghers` (a simple, admin-managed physical-location master
// table other tables reference by id), deliberately NOT folded into the
// Soil module's `lands` table: `lands` represents where soil is EXCAVATED
// FROM (tied to a landowner, khasra/khata numbers, a soil-excavation
// contract) — a completely different real-world place than where molding
// happens, and conflating the two would corrupt `lands`' landowner-payment
// semantics on rows that are really just "the kiln's own molding yard".
export const pathaiSites = mysqlTable("pathai_sites", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  distanceKm: double("distanceKm"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnActiveIdx: index("pathaisite_kiln_active_idx").on(t.kilnId, t.active) }));

// Salt fed into the mix at a given Pathai site — no existing table to
// extend (nothing in this codebase tracked salt before), same shape as
// fuelLogs (a per-site/per-chamber consumption log against a simple named
// resource) minus a dedicated "salt types" master table, since kilns don't
// use multiple kinds of salt the way they use multiple fuel types.
export const saltUsageLogs = mysqlTable("salt_usage_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  siteId: varchar("siteId", { length: 64 }).notNull(),
  quantityKg: double("quantityKg").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("saltusage_kiln_date_idx").on(t.kilnId, t.date) }));

// A bookkeeping trail of when the labor-work-report period boundary
// auto-fired (see laborReportSchedule.service.ts) — deliberately doesn't
// duplicate any molding/stacking/nikasi data; the Reports page's
// labourWorkReport report always computes live from those tables for
// whatever date range is asked for. This table exists purely so Settings
// can show "last generated on ..." and the cron never double-fires the
// same period twice (unique index).
export const laborReportRuns = mysqlTable("labor_report_runs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  periodStart: datetime("periodStart", { mode: "date" }).notNull(),
  periodEnd: datetime("periodEnd", { mode: "date" }).notNull(),
  generatedAt: createdAtColumn(),
}, (t) => ({
  kilnPeriodUnique: uniqueIndex("laborreportrun_kiln_period_unique").on(t.kilnId, t.periodStart, t.periodEnd),
}));

export const moldingEntries = mysqlTable("molding_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  workerId: varchar("workerId", { length: 64 }).notNull(),
  // Nullable — which Pathai site this molding happened at, for the
  // per-site production/stock breakdown. Null for every entry logged
  // before this existed, and for kilns that never set up sites at all
  // (the feature is fully optional — the Log Hazri form works exactly as
  // before if no site is picked).
  siteId: varchar("siteId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  ratePerThousand: double("ratePerThousand").notNull(),
  damagedCount: int("damagedCount").default(0),
  damageFault: varchar("damageFault", { length: 50, enum: DAMAGE_FAULT_OPTIONS }),
  date: dateColumn(),
  washedOut: boolean("washedOut").default(false),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("molding_kiln_date_idx").on(t.kilnId, t.date),
  kilnSiteIdx: index("molding_kiln_site_idx").on(t.kilnId, t.siteId),
}));

export const STACKING_MODES = ["BUGGI", "TRACTOR"] as const;
export const STACKING_QUALITY = ["GOOD", "AVERAGE", "POOR"] as const;

export const stackingEntries = mysqlTable("stacking_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  gangId: varchar("gangId", { length: 64 }).notNull(),
  stage: varchar("stage", { length: 50, enum: STACKING_STAGES }),
  // Nullable — only meaningful when stage is TRANSPORT: which Pathai site
  // these raw bricks were hauled FROM. TRANSPORT already means "moving raw
  // bricks from the molding ground to the kiln" (as opposed to
  // CHAMBER_STACKING, loading them into a gher) — this is what lets a
  // site's current raw-brick stock be computed as molded-there minus
  // transported-away-from-there.
  siteId: varchar("siteId", { length: 64 }),
  bricksCount: int("bricksCount").notNull(),
  damageCount: int("damageCount").default(0),
  damageFault: varchar("damageFault", { length: 50, enum: DAMAGE_FAULT_OPTIONS }),
  ratePerThousand: double("ratePerThousand"),
  qualityRating: varchar("qualityRating", { length: 50, enum: STACKING_QUALITY }).default("GOOD"),
  mode: varchar("mode", { length: 50, enum: STACKING_MODES }),
  tractorNumber: varchar("tractorNumber", { length: 255 }),
  buggiCount: int("buggiCount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("stacking_kiln_date_idx").on(t.kilnId, t.date),
  kilnSiteIdx: index("stacking_kiln_site_idx").on(t.kilnId, t.siteId),
}));

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
  seasonId: varchar("seasonId", { length: 64 }),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  // Legacy fixed 4-way split — stays populated (and displayed) on every row
  // created before the switch to admin-defined Brick Categories below;
  // simply left at their 0 default on every row created after. Never
  // written to going forward — see `items`.
  a1Count: int("a1Count").notNull().default(0),
  jhamaCount: int("jhamaCount").notNull().default(0),
  pelaCount: int("pelaCount").notNull().default(0),
  rodaCount: int("rodaCount").notNull().default(0),
  // The kiln's own Brick Categories (categoryId + bricksCount per line,
  // pricePerBrick/amount unused — same BrickLineItem shape Dispatch/Invoice
  // use, no pricing concept here) — what a chamber's baked output is
  // actually graded into now. Each line credits real, dispatchable stock
  // via brickCategory.service.ts's createBrickProductionEntry, unlike the
  // legacy columns above which only ever fed a disconnected dashboard
  // ledger. NULL on every row created before this existed.
  items: itemsColumn(),
  stackedCount: int("stackedCount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("grading_kiln_date_idx").on(t.kilnId, t.date) }));

export const SHIFT_TYPES = ["DAY", "NIGHT"] as const;

export const firingShifts = mysqlTable("firing_shifts", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  gherNumber: int("gherNumber").notNull(),
  startedAt: datetime("startedAt", { mode: "date" }).$defaultFn(() => new Date()),
}, (t) => ({ kilnStartedIdx: index("firemove_kiln_started_idx").on(t.kilnId, t.startedAt) }));

export const INCIDENT_TYPES = ["CRACK_LEAKAGE", "WEATHER_FLOODING", "ELECTRICAL_FAILURE", "OTHER"] as const;

export const kilnIncidents = mysqlTable("kiln_incidents", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  gangId: varchar("gangId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  damagedCount: int("damagedCount").default(0),
  damageFault: varchar("damageFault", { length: 50, enum: DAMAGE_FAULT_OPTIONS }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("nikasi_kiln_date_idx").on(t.kilnId, t.date) }));

export const loadingEntries = mysqlTable("loading_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
  // Plain, sequential per-kiln trip counter ("1", "2", ...) — same
  // never-resets convention as dispatches.invoiceNumber. Nullable at the DB
  // level only because rows created before this field existed have none;
  // every row created going forward always gets one (see
  // generateTripNumber/the retry loop in createBrickLoadingEntry).
  tripNumber: varchar("tripNumber", { length: 64 }),
  // Plain, denormalized identity fields, same convention as
  // dispatches.customerName/driverName -- a walk-in party/driver for a
  // single trip, not necessarily a linked Person record.
  customerName: varchar("customerName", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  customerAddress: varchar("customerAddress", { length: 255 }),
  driverName: varchar("driverName", { length: 255 }),
  driverPhone: varchar("driverPhone", { length: 255 }),
  vehicleType: varchar("vehicleType", { length: 50, enum: BRICK_VEHICLE_TYPES }).notNull(),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }).notNull(),
  // Legacy — no longer collected on the Log Trip form (driver identity is
  // now the plain driverName/driverPhone above, matching dispatches' own
  // driverId-to-driverName migration), kept only so rows created before
  // this change still resolve their driver for display/history.
  driverId: varchar("driverId", { length: 64 }),
  // Loaded Brick Count -- what physically left the yard on this trip;
  // drives the brickCategories stock deduction below same as always.
  bricksCount: int("bricksCount").notNull(),
  // Unloaded Brick Count -- purely informational/billing (drives
  // unloadingCharge below), no stock or dispatch side effects.
  unloadedBricksCount: int("unloadedBricksCount"),
  // Legacy -- no longer collected on the Log Trip form or used in the
  // loadingCharge/unloadingCharge formulas below (see
  // brickLoading.service.ts's computeLaborCharge), kept nullable so rows
  // created before laborer count was dropped from the form still read
  // back correctly.
  loadingLaborerCount: int("loadingLaborerCount"),
  loadingRatePerThousand: double("loadingRatePerThousand"),
  unloadingLaborerCount: int("unloadingLaborerCount"),
  unloadingRatePerThousand: double("unloadingRatePerThousand"),
  // Driver Reward (Inam) -- a plain stored figure with no ledger effect,
  // same as dispatches.driverTipAmount; only ever posts a TIP ledger
  // correction for legacy rows that still carry a driverId (see the
  // guards in brickLoading.service.ts).
  tipAmount: double("tipAmount").default(0),
  // How the Driver Reward/Loading/Unloading Charge amounts above were
  // actually paid — each independent (a trip's driver reward might be
  // cash while its loading charge is split) since they're three distinct
  // costs, auto-logged as three separate Expense rows (see
  // createBrickLoadingEntry). Nullable — the split fields only mean
  // anything when their own mode is CASH_AND_ONLINE, same convention as
  // dispatches.cashAmount/onlineAmount.
  tipPaymentMode: varchar("tipPaymentMode", { length: 20, enum: SIMPLE_PAYMENT_MODES }),
  tipCashAmount: double("tipCashAmount"),
  tipOnlineAmount: double("tipOnlineAmount"),
  // Total Loading Charge = (bricksCount/1000) x loadingLaborerCount x
  // loadingRatePerThousand -- computed and stored at create/edit time,
  // same convention as `amount` below.
  loadingCharge: double("loadingCharge"),
  loadingPaymentMode: varchar("loadingPaymentMode", { length: 20, enum: SIMPLE_PAYMENT_MODES }),
  loadingCashAmount: double("loadingCashAmount"),
  loadingOnlineAmount: double("loadingOnlineAmount"),
  // Total Unloading Charge = (unloadedBricksCount/1000) x
  // unloadingLaborerCount x unloadingRatePerThousand.
  unloadingCharge: double("unloadingCharge"),
  unloadingPaymentMode: varchar("unloadingPaymentMode", { length: 20, enum: SIMPLE_PAYMENT_MODES }),
  unloadingCashAmount: double("unloadingCashAmount"),
  unloadingOnlineAmount: double("unloadingOnlineAmount"),
  // Legacy -- no longer collected on the Log Trip form; kept nullable so
  // old rows' stored `amount` (which did net this out) still reads back
  // correctly.
  discountAmount: double("discountAmount"),
  // Admin-entered price for THIS trip -- deliberately independent of
  // brickCategories.pricePerBrick (that column is just a default/reference;
  // the actual price varies customer to customer, so it's never
  // auto-filled here, only typed in per trip).
  pricePerBrick: double("pricePerBrick"),
  // Total Amount = bricksCount x this trip's own pricePerBrick -- the
  // brick sale value alone, independent of loading/unloading charges
  // above. Computed and stored at create/edit time so it displays
  // reliably even if the auto-linked Dispatch below failed or was never
  // created.
  amount: double("amount"),
  // Which brick category was loaded — for stock deduction only; its own
  // pricePerBrick is not used to price this trip (see pricePerBrick
  // above). See brickLoading.service.ts.
  categoryId: varchar("categoryId", { length: 64 }),
  // Multi-category breakdown — one trip can now cover several brick
  // categories at once. When set, this is the source of truth and
  // categoryId/bricksCount/pricePerBrick/amount above become the
  // aggregate (categoryId = first item's when >1, the rest summed) for
  // every read path that doesn't yet know about `items`. See
  // BrickLineItem's own doc comment in _helpers.ts.
  items: itemsColumn(),
  dispatchId: varchar("dispatchId", { length: 64 }),
  // The delivery address for this trip's bricks (distinct from
  // customerAddress, the customer's own billing/contact address) — carried
  // forward (editable) onto the Dispatch it's linked to, and from there
  // onto any Challan/Gate Pass/Invoice generated from that dispatch.
  placeOfSupply: varchar("placeOfSupply", { length: 255 }),
  // Loading Date (existing `date` column, unrenamed to avoid a data
  // migration -- every historical row's `date` already meant this).
  date: dateColumn(),
  unloadingDate: datetime("unloadingDate", { mode: "date" }),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("brickloading_kiln_date_idx").on(t.kilnId, t.date),
  // Not violated by historical NULL tripNumbers — MySQL unique indexes
  // allow multiple NULLs — only real, generated numbers are ever checked
  // against each other. Scoped to (kilnId, seasonId, tripNumber), not just
  // (kilnId, tripNumber), so trip numbering restarts at 1 each new season.
  kilnTripNumberUnique: uniqueIndex("brickloading_kiln_tripnumber_unique").on(t.kilnId, t.seasonId, t.tripNumber),
}));

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
  seasonId: varchar("seasonId", { length: 64 }),
  categoryId: varchar("categoryId", { length: 64 }).notNull(),
  bricksCount: int("bricksCount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("brickprod_kiln_date_idx").on(t.kilnId, t.date) }));

export const productionLogs = mysqlTable("production_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
  type: varchar("type", { length: 50, enum: WASTAGE_TYPES }).notNull(),
  cause: varchar("cause", { length: 50, enum: WASTAGE_CAUSES }).notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 50 }).default("trolley"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("wastage_kiln_date_idx").on(t.kilnId, t.date) }));
