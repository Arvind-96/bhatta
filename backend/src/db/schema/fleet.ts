import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";
import { LEDGER_PAYMENT_MODES } from "./people";

export const MACHINE_TYPES = [
  "TRACTOR", "TRUCK", "JCB", "PUG_MILL", "MOLDING_MACHINE", "WEIGHBRIDGE",
  "GENERATOR", "PUMP", "BLOWER", "OTHER",
] as const;

export const machines = sqliteTable("machines", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: text("name").notNull(),
  type: text("type", { enum: MACHINE_TYPES }).notNull(),
  identifier: text("identifier"),
  active: integer("active", { mode: "boolean" }).default(true),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnTypeIdx: index("machine_kiln_type_idx").on(t.kilnId, t.type) }));

export const MACHINE_FUEL_TYPES = ["DIESEL", "PETROL", "ELECTRICITY"] as const;

export const machineFuelLogs = sqliteTable("machine_fuel_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  machineId: text("machineId").notNull(),
  fuelType: text("fuelType", { enum: MACHINE_FUEL_TYPES }).notNull(),
  quantity: real("quantity").notNull(),
  hoursRun: real("hoursRun"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("machinefuel_kiln_date_idx").on(t.kilnId, t.date) }));

export const machineMaintenanceLogs = sqliteTable("machine_maintenance_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  machineId: text("machineId").notNull(),
  description: text("description").notNull(),
  cost: real("cost").default(0),
  downtimeHours: real("downtimeHours").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("machinemaint_kiln_date_idx").on(t.kilnId, t.date) }));

export const inventoryItems = sqliteTable("inventory_items", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: text("name").notNull(),
  quantity: real("quantity").notNull().default(0),
  unit: text("unit").default("pcs"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameIdx: index("inventoryitem_kiln_name_idx").on(t.kilnId, t.name) }));

export const suppliedItems = sqliteTable("supplied_items", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: text("personId").notNull(),
  itemId: text("itemId").notNull(),
  quantity: real("quantity").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnPersonIdx: index("supplieditem_kiln_person_idx").on(t.kilnId, t.personId) }));

export const fuelTypes = sqliteTable("fuel_types", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: text("name").notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameUnique: uniqueIndex("fueltype_kiln_name_unique").on(t.kilnId, t.name) }));

export const fuelPurchases = sqliteTable("fuel_purchases", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  fuelType: text("fuelType").notNull(),
  supplierId: text("supplierId"),
  vehicleNumber: text("vehicleNumber"),
  invoicedWeightKg: real("invoicedWeightKg").notNull(),
  actualWeightKg: real("actualWeightKg").notNull(),
  amount: real("amount").notNull(),
  paidAmount: real("paidAmount").default(0),
  paymentMode: text("paymentMode", { enum: LEDGER_PAYMENT_MODES }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("fuelpurchase_kiln_date_idx").on(t.kilnId, t.date) }));

export const fuelLogs = sqliteTable("fuel_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: text("gherId").notNull(),
  fuelType: text("fuelType").notNull(),
  quantityKg: real("quantityKg").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("fuellog_kiln_date_idx").on(t.kilnId, t.date) }));

export const kilnVehicles = sqliteTable("kiln_vehicles", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameIdx: index("kilnvehicle_kiln_name_idx").on(t.kilnId, t.name) }));

export const vehicleDieselEntries = sqliteTable("vehicle_diesel_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  vehicleId: text("vehicleId").notNull(),
  quantityLiters: real("quantityLiters").notNull(),
  costAmount: real("costAmount"),
  paymentMode: text("paymentMode", { enum: LEDGER_PAYMENT_MODES }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("vehicledieselentry_kiln_date_idx").on(t.kilnId, t.date) }));
