import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { fuelLogs, ghers } from "../db/schema";
import { assertGherInKiln } from "./gher.service";
import { assertFuelTypeExists } from "./fuelType.service";
import { emitToKiln } from "../config/socket";

export interface CreateFuelLogInput {
  kilnId: string;
  gherId: string;
  fuelType: string;
  quantityKg: number;
  date?: Date;
  notes?: string;
}

export async function createFuelLog(input: CreateFuelLogInput) {
  await assertGherInKiln(input.kilnId, input.gherId);
  await assertFuelTypeExists(input.kilnId, input.fuelType);
  const _id = randomUUID();
  await db.insert(fuelLogs).values({ ...input, _id });
  const log = (await db.select().from(fuelLogs).where(eq(fuelLogs._id, _id)))[0]!;
  emitToKiln(input.kilnId, "fuelLog:update", log);
  return log;
}

export interface UpdateFuelLogInput {
  gherId?: string;
  fuelType?: string;
  quantityKg?: number;
  notes?: string;
}

export async function updateFuelLog(kilnId: string, logId: string, input: UpdateFuelLogInput) {
  const existing = (await db.select().from(fuelLogs).where(and(eq(fuelLogs._id, logId), eq(fuelLogs.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Fuel log not found in this kiln");
  if (input.gherId) await assertGherInKiln(kilnId, input.gherId);
  if (input.fuelType) await assertFuelTypeExists(kilnId, input.fuelType);

  await db.update(fuelLogs).set(input).where(eq(fuelLogs._id, logId));
  const updated = (await db.select().from(fuelLogs).where(eq(fuelLogs._id, logId)))[0]!;
  emitToKiln(kilnId, "fuelLog:update", updated);
  return updated;
}

export async function deleteFuelLog(kilnId: string, logId: string) {
  const existing = (await db.select().from(fuelLogs).where(and(eq(fuelLogs._id, logId), eq(fuelLogs.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Fuel log not found in this kiln");

  await db.delete(fuelLogs).where(eq(fuelLogs._id, logId));
  emitToKiln(kilnId, "fuelLog:update", { _id: logId, deleted: true });
}

export async function listFuelLogs(kilnId: string, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), gte(fuelLogs.date, since))).orderBy(desc(fuelLogs.date));

  const gherIds = [...new Set(rows.map((r) => r.gherId))];
  const gherRows = gherIds.length ? await db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)) : [];
  const gherById = new Map(gherRows.map((g) => [g._id, g]));
  return rows.map((r) => ({ ...r, gherId: gherById.get(r.gherId) ?? r.gherId }));
}

export async function totalFuelConsumed(kilnId: string, since: Date) {
  const logs = await db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), gte(fuelLogs.date, since)));
  return logs.reduce((sum, l) => sum + l.quantityKg, 0);
}

// The Firing (Pakayi) page's top-of-page summary — how much of each fuel
// was fed into chambers today / this week / this month / this year, so the
// admin doesn't have to page through the raw log to see the picture.
export async function fuelLogPeriodTotals(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const [today, week, month, year] = await Promise.all([
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), gte(fuelLogs.date, startOfDay))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), gte(fuelLogs.date, weekAgo))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), gte(fuelLogs.date, monthAgo))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), gte(fuelLogs.date, yearAgo))),
  ]);

  function byFuelType(logs: typeof today) {
    const totals = new Map<string, number>();
    for (const l of logs) totals.set(l.fuelType, (totals.get(l.fuelType) ?? 0) + l.quantityKg);
    return Object.fromEntries(totals);
  }

  return {
    today: { total: today.reduce((s, l) => s + l.quantityKg, 0), byFuelType: byFuelType(today) },
    week: { total: week.reduce((s, l) => s + l.quantityKg, 0), byFuelType: byFuelType(week) },
    month: { total: month.reduce((s, l) => s + l.quantityKg, 0), byFuelType: byFuelType(month) },
    year: { total: year.reduce((s, l) => s + l.quantityKg, 0), byFuelType: byFuelType(year) },
  };
}
