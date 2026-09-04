import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { fuelLogs, ghers } from "../db/schema";
import { assertGherInKiln } from "./gher.service";
import { assertFuelTypeExists } from "./fuelType.service";
import { emitToKiln } from "../config/socket";
import { istStartOfDay } from "../utils/istTime";

export interface CreateFuelLogInput {
  kilnId: string;
  seasonId: string;
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

export async function listFuelLogs(kilnId: string, seasonId: string, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), gte(fuelLogs.date, since))).orderBy(desc(fuelLogs.date));

  const gherIds = [...new Set(rows.map((r) => r.gherId))];
  const gherRows = gherIds.length ? await db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)) : [];
  const gherById = new Map(gherRows.map((g) => [g._id, g]));
  return rows.map((r) => ({ ...r, gherId: gherById.get(r.gherId) ?? r.gherId }));
}

// One chamber's own fuel feed, broken down by type — the Firing chamber
// board's "how much fuel is going into this chamber" figure, scoped the
// same way stackedSinceForGher scopes bricks (since = the chamber's own
// cycleStartedAt, or omitted for all-time).
export async function fuelConsumedForGher(kilnId: string, seasonId: string, gherId: string, since?: Date, until?: Date) {
  const conditions = [eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), eq(fuelLogs.gherId, gherId)];
  if (since) conditions.push(gte(fuelLogs.date, since));
  if (until) conditions.push(lte(fuelLogs.date, until));
  const logs = await db.select().from(fuelLogs).where(and(...conditions));

  const byFuelType = new Map<string, number>();
  for (const l of logs) byFuelType.set(l.fuelType, (byFuelType.get(l.fuelType) ?? 0) + l.quantityKg);

  return { totalKg: logs.reduce((sum, l) => sum + l.quantityKg, 0), byFuelType: Object.fromEntries(byFuelType) };
}

// seasonIds, not a single seasonId — see dispatch.service.ts's
// totalDispatchedSince for the convention.
export async function totalFuelConsumed(kilnId: string, seasonIds: string[], since: Date) {
  const logs = await db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), inArray(fuelLogs.seasonId, seasonIds), gte(fuelLogs.date, since)));
  return logs.reduce((sum, l) => sum + l.quantityKg, 0);
}

// The Firing (Pakayi) page's top-of-page summary — how much of each fuel
// was fed into chambers today / this week / this month / this year, so the
// admin doesn't have to page through the raw log to see the picture.
export async function fuelLogPeriodTotals(kilnId: string, seasonId: string) {
  // Bug fix: server-local midnight (the VPS runs in UTC, not IST) used to
  // decide "today" here — a fuel log entered between IST midnight and
  // 5:30am fell out of "Today" and only appeared once the server's own
  // UTC day rolled over. Same istStartOfDay fix already applied to
  // kilnVehicle.service.ts's dieselPeriodTotals.
  const now = new Date();
  const startOfDay = istStartOfDay(now);
  const weekAgo = istStartOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const monthAgo = istStartOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const yearAgo = istStartOfDay(oneYearAgo);

  const [today, week, month, year] = await Promise.all([
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), gte(fuelLogs.date, startOfDay))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), gte(fuelLogs.date, weekAgo))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), gte(fuelLogs.date, monthAgo))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), gte(fuelLogs.date, yearAgo))),
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
