import { double, mysqlTable, varchar, text, uniqueIndex, index, boolean } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";
import { LEDGER_PAYMENT_MODES } from "./people";

export const MACHINE_TYPES = [
  "TRACTOR", "TRUCK", "JCB", "PUG_MILL", "MOLDING_MACHINE", "WEIGHBRIDGE",
  "GENERATOR", "PUMP", "BLOWER", "OTHER",
] as const;

export const machines = mysqlTable("machines", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50, enum: MACHINE_TYPES }).notNull(),
  identifier: varchar("identifier", { length: 255 }),
  active: boolean("active").default(true),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnTypeIdx: index("machine_kiln_type_idx").on(t.kilnId, t.type) }));

export const MACHINE_FUEL_TYPES = ["DIESEL", "PETROL", "ELECTRICITY"] as const;

export const machineFuelLogs = mysqlTable("machine_fuel_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  machineId: varchar("machineId", { length: 64 }).notNull(),
  fuelType: varchar("fuelType", { length: 50, enum: MACHINE_FUEL_TYPES }).notNull(),
  quantity: double("quantity").notNull(),
  hoursRun: double("hoursRun"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("machinefuel_kiln_date_idx").on(t.kilnId, t.date) }));

export const machineMaintenanceLogs = mysqlTable("machine_maintenance_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  machineId: varchar("machineId", { length: 64 }).notNull(),
  description: text("description").notNull(),
  cost: double("cost").default(0),
  downtimeHours: double("downtimeHours").default(0),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("machinemaint_kiln_date_idx").on(t.kilnId, t.date) }));

export const inventoryItems = mysqlTable("inventory_items", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  quantity: double("quantity").notNull().default(0),
  unit: varchar("unit", { length: 50 }).default("pcs"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameIdx: index("inventoryitem_kiln_name_idx").on(t.kilnId, t.name) }));

export const suppliedItems = mysqlTable("supplied_items", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  personId: varchar("personId", { length: 64 }).notNull(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  quantity: double("quantity").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnPersonIdx: index("supplieditem_kiln_person_idx").on(t.kilnId, t.personId) }));

export const fuelTypes = mysqlTable("fuel_types", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameUnique: uniqueIndex("fueltype_kiln_name_unique").on(t.kilnId, t.name) }));

export const fuelPurchases = mysqlTable("fuel_purchases", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  fuelType: varchar("fuelType", { length: 255 }).notNull(),
  supplierId: varchar("supplierId", { length: 64 }),
  vehicleNumber: varchar("vehicleNumber", { length: 255 }),
  invoicedWeightKg: double("invoicedWeightKg").notNull(),
  actualWeightKg: double("actualWeightKg").notNull(),
  amount: double("amount").notNull(),
  paidAmount: double("paidAmount").default(0),
  paymentMode: varchar("paymentMode", { length: 50, enum: LEDGER_PAYMENT_MODES }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("fuelpurchase_kiln_date_idx").on(t.kilnId, t.date) }));

export const fuelLogs = mysqlTable("fuel_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  gherId: varchar("gherId", { length: 64 }).notNull(),
  fuelType: varchar("fuelType", { length: 255 }).notNull(),
  quantityKg: double("quantityKg").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("fuellog_kiln_date_idx").on(t.kilnId, t.date) }));

export const kilnVehicles = mysqlTable("kiln_vehicles", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameIdx: index("kilnvehicle_kiln_name_idx").on(t.kilnId, t.name) }));

export const vehicleDieselEntries = mysqlTable("vehicle_diesel_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  quantityLiters: double("quantityLiters").notNull(),
  costAmount: double("costAmount"),
  paymentMode: varchar("paymentMode", { length: 50, enum: LEDGER_PAYMENT_MODES }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnDateIdx: index("vehicledieselentry_kiln_date_idx").on(t.kilnId, t.date) }));
