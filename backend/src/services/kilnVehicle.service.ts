import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "../db/client";
import { kilnVehicles, vehicleDieselEntries, people, LEDGER_PAYMENT_MODES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";
import { istStartOfDay } from "../utils/istTime";

export interface CreateVehicleInput {
  kilnId: string;
  name: string;
  type: string;
  initialMeterReading?: number;
  oilTankCapacity?: number;
  notes?: string;
}

export async function createVehicle(input: CreateVehicleInput) {
  const _id = randomUUID();
  await db.insert(kilnVehicles).values({ ...input, _id });
  const vehicle = (await db.select().from(kilnVehicles).where(eq(kilnVehicles._id, _id)))[0]!;
  emitToKiln(input.kilnId, "kilnVehicle:update", vehicle);
  return vehicle;
}

export async function listVehicles(kilnId: string) {
  return db.select().from(kilnVehicles).where(eq(kilnVehicles.kilnId, kilnId)).orderBy(asc(kilnVehicles.type), asc(kilnVehicles.name));
}

// No DB-level FK ties vehicleDieselEntries.vehicleId back to kilnVehicles,
// so a hard delete here used to silently orphan them — vehicleDieselSummary
// and dieselPeriodTotals both still summed the orphaned rows (bucketed
// under "Unknown vehicle"), while the Reports → Vehicle Work report
// (which iterates only over currently-existing vehicles) silently dropped
// them entirely — the two pages then disagreed on the same underlying
// data. Guarded the same check-then-throw way as deleteCustomer in
// customer.service.ts: refuse instead of deleting when diesel history
// still exists, and tell the admin why.
export async function deleteVehicle(kilnId: string, vehicleId: string) {
  const existing = (await db.select().from(kilnVehicles).where(and(eq(kilnVehicles._id, vehicleId), eq(kilnVehicles.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Vehicle not found in this kiln");

  const linkedEntries = await db.select({ _id: vehicleDieselEntries._id }).from(vehicleDieselEntries).where(eq(vehicleDieselEntries.vehicleId, vehicleId));
  if (linkedEntries.length > 0) {
    throw new Error(`Cannot delete this vehicle — ${linkedEntries.length} diesel entry(ies) are linked to it. Its diesel history would become untraceable.`);
  }

  await db.delete(kilnVehicles).where(eq(kilnVehicles._id, vehicleId));
  emitToKiln(kilnId, "kilnVehicle:update", { _id: vehicleId, deleted: true });
  return existing;
}

async function assertVehicleInKiln(kilnId: string, vehicleId: string) {
  const vehicle = (await db.select().from(kilnVehicles).where(and(eq(kilnVehicles._id, vehicleId), eq(kilnVehicles.kilnId, kilnId))))[0];
  if (!vehicle) throw new Error("Vehicle not found in this kiln");
  return vehicle;
}

// The vehicle's own "last known" odometer reading right before a new entry
// dated `beforeDate` — the most recent prior diesel entry's own
// initialMeterReading, or the vehicle's baseline initialMeterReading if
// this is its first-ever fill. Never trusted from the client; always
// derived server-side so it can't drift from what actually happened.
async function lastKnownMeterReading(kilnId: string, vehicleId: string, excludeEntryId?: string) {
  const conditions = [eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.vehicleId, vehicleId)];
  if (excludeEntryId) conditions.push(ne(vehicleDieselEntries._id, excludeEntryId));
  const priorEntries = await db
    .select({ initialMeterReading: vehicleDieselEntries.initialMeterReading, date: vehicleDieselEntries.date, createdAt: vehicleDieselEntries.createdAt })
    .from(vehicleDieselEntries)
    .where(and(...conditions))
    .orderBy(desc(vehicleDieselEntries.date), desc(vehicleDieselEntries.createdAt));
  if (priorEntries.length && priorEntries[0].initialMeterReading != null) return priorEntries[0].initialMeterReading;
  const vehicle = await assertVehicleInKiln(kilnId, vehicleId);
  return vehicle.initialMeterReading ?? undefined;
}

export interface CreateDieselEntryInput {
  kilnId: string;
  seasonId: string;
  vehicleId: string;
  quantityLiters: number;
  initialMeterReading?: number;
  driverId?: string;
  costAmount?: number;
  paymentMode?: Exclude<(typeof LEDGER_PAYMENT_MODES)[number], "CASH_AND_ONLINE">;
  date?: Date;
  notes?: string;
}

export async function createDieselEntry(input: CreateDieselEntryInput) {
  const vehicle = await assertVehicleInKiln(input.kilnId, input.vehicleId);
  if (input.driverId) await assertPersonOfType(input.kilnId, input.driverId, ["DRIVER"]);

  const lastMeterReading = await lastKnownMeterReading(input.kilnId, input.vehicleId);

  const _id = randomUUID();
  await db.insert(vehicleDieselEntries).values({ ...input, vehicleType: vehicle.type, lastMeterReading, _id });
  const entry = (await db.select().from(vehicleDieselEntries).where(eq(vehicleDieselEntries._id, _id)))[0]!;
  emitToKiln(input.kilnId, "vehicleDiesel:update", entry);
  return entry;
}

export interface UpdateDieselEntryInput {
  vehicleId?: string;
  quantityLiters?: number;
  initialMeterReading?: number;
  driverId?: string | null;
  costAmount?: number;
  paymentMode?: Exclude<(typeof LEDGER_PAYMENT_MODES)[number], "CASH_AND_ONLINE">;
  date?: Date;
  notes?: string;
}

export async function updateDieselEntry(kilnId: string, entryId: string, input: UpdateDieselEntryInput) {
  const existing = (await db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries._id, entryId), eq(vehicleDieselEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Diesel entry not found in this kiln");
  if (input.driverId) await assertPersonOfType(kilnId, input.driverId, ["DRIVER"]);

  const vehicleId = input.vehicleId ?? existing.vehicleId;
  let vehicleType = existing.vehicleType;
  if (input.vehicleId && input.vehicleId !== existing.vehicleId) {
    const vehicle = await assertVehicleInKiln(kilnId, input.vehicleId);
    vehicleType = vehicle.type;
  }
  // Re-derive lastMeterReading whenever the vehicle or this entry's own
  // reading changes, so it stays consistent with the rest of that
  // vehicle's history instead of going stale.
  const lastMeterReading =
    input.vehicleId || input.initialMeterReading !== undefined ? await lastKnownMeterReading(kilnId, vehicleId, entryId) : existing.lastMeterReading;

  await db.update(vehicleDieselEntries).set({ ...input, vehicleType, lastMeterReading }).where(eq(vehicleDieselEntries._id, entryId));
  const updated = (await db.select().from(vehicleDieselEntries).where(eq(vehicleDieselEntries._id, entryId)))[0]!;
  emitToKiln(kilnId, "vehicleDiesel:update", updated);
  return updated;
}

export interface ListDieselEntriesFilter {
  days?: number;
  driverId?: string;
  vehicleId?: string;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view
// (Reports' date-range queries).
export async function listDieselEntries(kilnId: string, seasonId: string | null, filter: ListDieselEntriesFilter = {}) {
  const conditions = [eq(vehicleDieselEntries.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(vehicleDieselEntries.seasonId, seasonId));
  if (filter.days) {
    const since = new Date();
    since.setDate(since.getDate() - filter.days);
    conditions.push(gte(vehicleDieselEntries.date, since));
  }
  if (filter.from) conditions.push(gte(vehicleDieselEntries.date, filter.from));
  if (filter.to) conditions.push(lte(vehicleDieselEntries.date, filter.to));
  if (filter.driverId) conditions.push(eq(vehicleDieselEntries.driverId, filter.driverId));
  if (filter.vehicleId) conditions.push(eq(vehicleDieselEntries.vehicleId, filter.vehicleId));
  const rows = await db.select().from(vehicleDieselEntries).where(and(...conditions)).orderBy(desc(vehicleDieselEntries.date));

  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId))];
  const vehicleRows = vehicleIds.length ? await db.select({ _id: kilnVehicles._id, name: kilnVehicles.name, type: kilnVehicles.type }).from(kilnVehicles).where(inArray(kilnVehicles._id, vehicleIds)) : [];
  const vehicleById = new Map(vehicleRows.map((v) => [v._id, v]));

  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((id): id is string => !!id))];
  const driverRows = driverIds.length ? await db.select({ _id: people._id, name: people.name, phone: people.phone }).from(people).where(inArray(people._id, driverIds)) : [];
  const driverById = new Map(driverRows.map((d) => [d._id, d]));

  return rows.map((r) => ({
    ...r,
    vehicleId: vehicleById.get(r.vehicleId) ?? r.vehicleId,
    driverId: r.driverId ? driverById.get(r.driverId) ?? r.driverId : r.driverId,
  }));
}

export async function deleteDieselEntry(kilnId: string, entryId: string) {
  const existing = (await db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries._id, entryId), eq(vehicleDieselEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Diesel entry not found in this kiln");
  await db.delete(vehicleDieselEntries).where(eq(vehicleDieselEntries._id, entryId));
  emitToKiln(kilnId, "vehicleDiesel:update", { _id: entryId, deleted: true });
  return existing;
}

// Per-vehicle rollup for a date range — the Vehicles report's data source
// (contrast with listDieselEntries above, which is the Diesel report's raw
// detail log over the same underlying table).
export async function vehicleDieselSummary(kilnId: string, seasonId: string | null, filter: { from?: Date; to?: Date } = {}) {
  const conditions = [eq(vehicleDieselEntries.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(vehicleDieselEntries.seasonId, seasonId));
  if (filter.from) conditions.push(gte(vehicleDieselEntries.date, filter.from));
  if (filter.to) conditions.push(lte(vehicleDieselEntries.date, filter.to));

  const [vehicles, entries] = await Promise.all([
    db.select().from(kilnVehicles).where(eq(kilnVehicles.kilnId, kilnId)).orderBy(asc(kilnVehicles.type), asc(kilnVehicles.name)),
    db.select().from(vehicleDieselEntries).where(and(...conditions)),
  ]);

  const entriesByVehicle = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!entriesByVehicle.has(e.vehicleId)) entriesByVehicle.set(e.vehicleId, []);
    entriesByVehicle.get(e.vehicleId)!.push(e);
  }

  return vehicles.map((v) => {
    const vEntries = entriesByVehicle.get(v._id) ?? [];
    const totalLiters = vEntries.reduce((sum, e) => sum + e.quantityLiters, 0);
    const meterReadings = vEntries.map((e) => e.initialMeterReading).filter((m): m is number => m != null);
    const distanceCovered = meterReadings.length >= 2 ? Math.max(...meterReadings) - Math.min(...meterReadings) : 0;
    return {
      vehicleId: v._id,
      vehicleName: v.name,
      vehicleType: v.type,
      fillUpCount: vEntries.length,
      totalLiters,
      distanceCovered,
    };
  });
}

// The Stock page's diesel-usage-at-a-glance — how much diesel went into
// each vehicle today / this week / this month / this year.
export async function dieselPeriodTotals(kilnId: string, seasonId: string) {
  const now = new Date();
  const startOfDay = istStartOfDay(now);
  const weekAgo = istStartOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const monthAgo = istStartOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const yearAgo = istStartOfDay(oneYearAgo);

  const [vehicles, today, week, month, year] = await Promise.all([
    db.select().from(kilnVehicles).where(eq(kilnVehicles.kilnId, kilnId)),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.seasonId, seasonId), gte(vehicleDieselEntries.date, startOfDay))),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.seasonId, seasonId), gte(vehicleDieselEntries.date, weekAgo))),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.seasonId, seasonId), gte(vehicleDieselEntries.date, monthAgo))),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.seasonId, seasonId), gte(vehicleDieselEntries.date, yearAgo))),
  ]);

  const vehicleNameById = new Map(vehicles.map((v) => [v._id, v.name]));

  // Bucket by vehicleId (not name) while summing, matching
  // vehicleDieselSummary above — kilnVehicles.name is only indexed, not
  // unique, so two same-named vehicles would otherwise silently merge
  // their totals into a single reported row. Only resolve id -> display
  // name at the very end, once each vehicle already has its own bucket.
  function byVehicle(entries: typeof today) {
    const totals = new Map<string, number>();
    for (const e of entries) {
      totals.set(e.vehicleId, (totals.get(e.vehicleId) ?? 0) + e.quantityLiters);
    }
    const result: Record<string, number> = {};
    for (const [vehicleId, total] of totals) {
      const name = vehicleNameById.get(vehicleId) ?? "Unknown vehicle";
      result[name] = (result[name] ?? 0) + total;
    }
    return result;
  }

  return {
    today: { total: today.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(today) },
    week: { total: week.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(week) },
    month: { total: month.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(month) },
    year: { total: year.reduce((s, e) => s + e.quantityLiters, 0), byVehicle: byVehicle(year) },
  };
}
