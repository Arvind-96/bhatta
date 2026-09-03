import { and, eq, gte, inArray, lte, SQL } from "drizzle-orm";
import { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { db } from "../../db/client";
import { moldingEntries, stackingEntries, nikasiEntries, brickLoadingEntries } from "../../db/schema";
import { round2, ProductionSummary } from "./types";

// "Every brick" alongside "every penny" — the physical-output counterpart
// to a person's ledger balance, pulled from the dedicated per-module
// tables (Molding by workerId, Stacking/Nikasi by gangId, Brick Loading by
// driverId) rather than the older generic work_entries table, since those
// dedicated tables are what the live Molding/Stacking/Nikasi/Brick Loading
// pages actually write to and display today.
// seasonId is nullable — pass null for an all-time, every-season view; the
// only current callers (people.reports.ts) are admin-picked date-range
// reports, which always pass null.
export async function personProductionTotals(kilnId: string, seasonId: string | null, personIds: string[], from?: Date, to?: Date): Promise<ProductionSummary> {
  if (personIds.length === 0) return { bricksCount: 0, damagedCount: 0, byModule: [] };

  const dateConditions = (col: AnyMySqlColumn): SQL[] => {
    const c: SQL[] = [];
    if (from) c.push(gte(col, from));
    if (to) c.push(lte(col, to));
    return c;
  };

  const [molding, stacking, nikasi, brickLoading] = await Promise.all([
    db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), seasonId ? eq(moldingEntries.seasonId, seasonId) : undefined, inArray(moldingEntries.workerId, personIds), ...dateConditions(moldingEntries.date))),
    db.select().from(stackingEntries).where(and(eq(stackingEntries.kilnId, kilnId), seasonId ? eq(stackingEntries.seasonId, seasonId) : undefined, inArray(stackingEntries.gangId, personIds), ...dateConditions(stackingEntries.date))),
    db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), seasonId ? eq(nikasiEntries.seasonId, seasonId) : undefined, inArray(nikasiEntries.gangId, personIds), ...dateConditions(nikasiEntries.date))),
    db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries.kilnId, kilnId), eq(brickLoadingEntries.cancelled, false), seasonId ? eq(brickLoadingEntries.seasonId, seasonId) : undefined, inArray(brickLoadingEntries.driverId, personIds), ...dateConditions(brickLoadingEntries.date))),
  ]);

  const byModule = [
    { module: "molding", bricksCount: molding.reduce((s, e) => s + (e.washedOut ? 0 : e.bricksCount), 0), damagedCount: molding.reduce((s, e) => s + (e.damagedCount ?? 0), 0) },
    { module: "stacking", bricksCount: stacking.reduce((s, e) => s + e.bricksCount, 0), damagedCount: stacking.reduce((s, e) => s + (e.damageCount ?? 0), 0) },
    { module: "nikasi", bricksCount: nikasi.reduce((s, e) => s + e.bricksCount, 0), damagedCount: nikasi.reduce((s, e) => s + (e.damagedCount ?? 0), 0) },
    { module: "brickLoading", bricksCount: brickLoading.reduce((s, e) => s + e.bricksCount, 0), damagedCount: 0 },
  ].filter((m) => m.bricksCount > 0 || m.damagedCount > 0);

  return {
    bricksCount: round2(byModule.reduce((s, m) => s + m.bricksCount, 0)),
    damagedCount: round2(byModule.reduce((s, m) => s + m.damagedCount, 0)),
    byModule,
  };
}
