import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { kilnVehicles, vehicleDieselEntries, LEDGER_PAYMENT_MODES } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreateVehicleInput {
  kilnId: string;
  name: string;
  type: string;
}

export async function createVehicle(input: CreateVehicleInput) {
  const _id = randomUUID();
  db.insert(kilnVehicles).values({ ...input, _id }).run();
  const vehicle = db.select().from(kilnVehicles).where(eq(kilnVehicles._id, _id)).get()!;
  emitToKiln(input.kilnId, "kilnVehicle:update", vehicle);
  return vehicle;
}

export async function listVehicles(kilnId: string) {
  return db.select().from(kilnVehicles).where(eq(kilnVehicles.kilnId, kilnId)).orderBy(asc(kilnVehicles.type), asc(kilnVehicles.name)).all();
}

export async function deleteVehicle(kilnId: string, vehicleId: string) {
  const existing = db.select().from(kilnVehicles).where(and(eq(kilnVehicles._id, vehicleId), eq(kilnVehicles.kilnId, kilnId))).get();
  if (!existing) throw new Error("Vehicle not found in this kiln");
  db.delete(kilnVehicles).where(eq(kilnVehicles._id, vehicleId)).run();
  emitToKiln(kilnId, "kilnVehicle:update", { _id: vehicleId, deleted: true });
  return existing;
}

async function assertVehicleInKiln(kilnId: string, vehicleId: string) {
  const vehicle = db.select().from(kilnVehicles).where(and(eq(kilnVehicles._id, vehicleId), eq(kilnVehicles.kilnId, kilnId))).get();
  if (!vehicle) throw new Error("Vehicle not found in this kiln");
  return vehicle;
}

export interface CreateDieselEntryInput {
  kilnId: string;
  vehicleId: string;
  quantityLiters: number;
  costAmount?: number;
  paymentMode?: Exclude<(typeof LEDGER_PAYMENT_MODES)[number], "CASH_AND_ONLINE">;
  date?: Date;
  notes?: string;
}

export async function createDieselEntry(input: CreateDieselEntryInput) {
  await assertVehicleInKiln(input.kilnId, input.vehicleId);
  const _id = randomUUID();
  db.insert(vehicleDieselEntries).values({ ...input, _id }).run();
  const entry = db.select().from(vehicleDieselEntries).where(eq(vehicleDieselEntries._id, _id)).get()!;
  emitToKiln(input.kilnId, "vehicleDiesel:update", entry);
  return entry;
}

export async function listDieselEntries(kilnId: string, days = 60) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), gte(vehicleDieselEntries.date, since))).orderBy(desc(vehicleDieselEntries.date)).all();

  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId))];
  const vehicleRows = vehicleIds.length ? await db.select({ _id: kilnVehicles._id, name: kilnVehicles.name, type: kilnVehicles.type }).from(kilnVehicles).where(inArray(kilnVehicles._id, vehicleIds)).all() : [];
  const vehicleById = new Map(vehicleRows.map((v) => [v._id, v]));
  return rows.map((r) => ({ ...r, vehicleId: vehicleById.get(r.vehicleId) ?? r.vehicleId }));
}

export async function deleteDieselEntry(kilnId: string, entryId: string) {
  const existing = db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries._id, entryId), eq(vehicleDieselEntries.kilnId, kilnId))).get();
  if (!existing) throw new Error("Diesel entry not found in this kiln");
  db.delete(vehicleDieselEntries).where(eq(vehicleDieselEntries._id, entryId)).run();
  emitToKiln(kilnId, "vehicleDiesel:update", { _id: entryId, deleted: true });
  return existing;
}

// The Stock page's diesel-usage-at-a-glance — how much diesel went into
// each vehicle today / this week / this month / this year.
export async function dieselPeriodTotals(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const [vehicles, today, week, month, year] = await Promise.all([
    db.select().from(kilnVehicles).where(eq(kilnVehicles.kilnId, kilnId)).all(),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), gte(vehicleDieselEntries.date, startOfDay))).all(),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), gte(vehicleDieselEntries.date, weekAgo))).all(),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), gte(vehicleDieselEntries.date, monthAgo))).all(),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), gte(vehicleDieselEntries.date, yearAgo))).all(),
  ]);

  const vehicleNameById = new Map(vehicles.map((v) => [v._id, v.name]));

  function byVehicle(entries: typeof today) {
    const totals = new Map<string, number>();
    for (const e of entries) {
      const name = vehicleNameById.get(e.vehicleId) ?? "Unknown vehicle";
      totals.set(name, (totals.get(name) ?? 0) + e.quantityLiters);
    }
    return Object.fromEntries(totals);
  }

  return {
    today: { total: today.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(today) },
    week: { total: week.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(week) },
    month: { total: month.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(month) },
    year: { total: year.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(year) },
  };
}
