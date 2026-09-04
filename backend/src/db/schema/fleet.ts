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
  purchaseDate: dateColumn("purchaseDate"),
  price: double("price"),
  purchasedByName: varchar("purchasedByName", { length: 255 }),
  purchasedByPhone: varchar("purchasedByPhone", { length: 255 }),
  warrantyDetails: text("warrantyDetails"),
  // What's been paid so far and what's still owed on `price` — updated on
  // creation (the initial payment) and on every installment payment (see
  // machine.service.ts's createInstallmentPayment). Independent of the
  // per-installment-row history below, which is the itemized audit trail
  // these two running totals are derived from.
  totalPaid: double("totalPaid").default(0),
  remainingDue: double("remainingDue").default(0),
  // Installment period in months, admin-entered — purely informational
  // (not used to schedule/remind), shown alongside totalPaid/remainingDue
  // on the machine's profile.
  tenureMonths: double("tenureMonths"),
  active: boolean("active").default(true),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnTypeIdx: index("machine_kiln_type_idx").on(t.kilnId, t.type) }));

// One row per installment/EMI payment logged against a machine — separate
// from the machine's own totalPaid/remainingDue running totals so the
// admin can see exactly when and how much was paid each time, not just
// the current balance.
export const machineInstallmentPayments = mysqlTable("machine_installment_payments", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  machineId: varchar("machineId", { length: 64 }).notNull(),
  amount: double("amount").notNull(),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnMachineIdx: index("machineinstallment_kiln_machine_idx").on(t.kilnId, t.machineId) }));

export const MACHINE_FUEL_TYPES = ["DIESEL", "PETROL", "ELECTRICITY"] as const;

export const machineFuelLogs = mysqlTable("machine_fuel_logs", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  seasonId: varchar("seasonId", { length: 64 }),
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
  // The vehicle's odometer reading at the time it was added — the baseline
  // a fresh vehicle's very first diesel entry falls back to for its own
  // "last known reading" snapshot (see vehicleDieselEntries.lastMeterReading
  // below), since there's no prior fill-up to read it from yet.
  initialMeterReading: double("initialMeterReading"),
  oilTankCapacity: double("oilTankCapacity"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnNameIdx: index("kilnvehicle_kiln_name_idx").on(t.kilnId, t.name) }));

export const vehicleDieselEntries = mysqlTable("vehicle_diesel_entries", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  // Snapshot of the vehicle's own `type` at fill-up time — printed/shown on
  // this entry even if the vehicle's type is edited later, same convention
  // as dispatches.customerAddress snapshotting the customer's address.
  vehicleType: varchar("vehicleType", { length: 255 }),
  quantityLiters: double("quantityLiters").notNull(),
  // The odometer reading AT this fill-up, admin-entered. lastMeterReading
  // is never admin-entered — it's captured automatically at creation time
  // from this same vehicle's most recent prior entry's initialMeterReading
  // (or the vehicle's own baseline initialMeterReading if this is its
  // first-ever fill), so "initialMeterReading - lastMeterReading" always
  // reads as the distance covered since the last fill-up.
  initialMeterReading: double("initialMeterReading"),
  lastMeterReading: double("lastMeterReading"),
  // Real link to a `people` row (type DRIVER) — not free text, so a fill-up
  // can be surfaced on that driver's own Staff profile (see
  // kilnVehicle.service.ts's createDieselEntry and
  // StaffDetailPage/DriverDieselHistory.tsx).
  driverId: varchar("driverId", { length: 64 }),
  // Nullable — older entries (from when this field was briefly missing
  // from the Log Diesel Fill-up form) simply have no cost recorded.
  costAmount: double("costAmount"),
  paymentMode: varchar("paymentMode", { length: 50, enum: LEDGER_PAYMENT_MODES }),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("vehicledieselentry_kiln_date_idx").on(t.kilnId, t.date),
  kilnDriverIdx: index("vehicledieselentry_kiln_driver_idx").on(t.kilnId, t.driverId),
}));
