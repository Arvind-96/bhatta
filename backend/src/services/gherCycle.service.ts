import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { gherCycles, ghers, chamberGradings } from "../db/schema";
import { stackedSinceForGher } from "./stacking.service";
import { fuelConsumedForGher } from "./fuelLog.service";
import { unloadedSinceForGher } from "./nikasi.service";
import { totalBricksOf } from "./chamberGrading.service";

// Kept in its own file, same reasoning as chamberOverview.service.ts —
// stacking/fuelLog/nikasi services all import assertGherInKiln FROM
// gher.service.ts, so anything needing data from more than one of them
// (plus gher.service.ts itself) has to live outside all four to avoid a
// circular import.
export async function listGherCycles(kilnId: string, seasonId: string, gherId?: string) {
  const conditions = [eq(gherCycles.kilnId, kilnId), eq(gherCycles.seasonId, seasonId)];
  if (gherId) conditions.push(eq(gherCycles.gherId, gherId));
  return db.select().from(gherCycles).where(and(...conditions)).orderBy(desc(gherCycles.cycleNumber));
}

// Every cycle in the given window, each with its own cross-check summary —
// the actual "Cross Check Report of Kachi Bharai and Nikasi Round / Gher
// Wise" report, one row per completed (or in-progress) cycle across every
// chamber, rather than a single cycle's detail. Bounded to a modest number
// of cycles per kiln per season in practice (one kiln rarely runs more than
// a few hundred firing cycles a year across all chambers combined), so the
// per-cycle Promise.all below stays cheap.
export async function listGherCycleCrossChecks(kilnId: string, seasonId: string | null, filter: { from?: Date; to?: Date } = {}) {
  const conditions = [eq(gherCycles.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(gherCycles.seasonId, seasonId));
  if (filter.from) conditions.push(gte(gherCycles.stackingStartedAt, filter.from));
  if (filter.to) conditions.push(lte(gherCycles.stackingStartedAt, filter.to));
  const cycles = await db.select().from(gherCycles).where(and(...conditions)).orderBy(desc(gherCycles.stackingStartedAt));
  return Promise.all(cycles.map((c) => gherCycleCrossCheck(kilnId, seasonId ?? c.seasonId ?? "", c._id)));
}

// The historical "Nikasi Round / Gher Wise Cross Check" report — for one
// COMPLETED cycle, compares what was stacked in against what fuel/labour
// went in and what actually came back out, bounded to just that cycle's
// own window (unlike the live Firing-page board, which only ever shows the
// CURRENT cycle). The upper bound is the next cycle's own start (or, for
// the most recent cycle on a chamber, left open-ended — same as the live
// board today).
export async function gherCycleCrossCheck(kilnId: string, seasonId: string, cycleId: string) {
  const cycle = (await db.select().from(gherCycles).where(and(eq(gherCycles._id, cycleId), eq(gherCycles.kilnId, kilnId))))[0];
  if (!cycle) throw new Error("Gher cycle not found in this kiln");

  const gher = (await db.select().from(ghers).where(eq(ghers._id, cycle.gherId)))[0];

  const nextCycle = (await db
    .select()
    .from(gherCycles)
    .where(and(eq(gherCycles.gherId, cycle.gherId), eq(gherCycles.cycleNumber, cycle.cycleNumber + 1))))[0];

  const since = cycle.stackingStartedAt ?? undefined;
  const until = nextCycle?.stackingStartedAt ?? undefined;
  const cycleSeasonId = cycle.seasonId ?? seasonId;

  const [bricksStacked, fuel, bricksUnloaded, gradings] = await Promise.all([
    stackedSinceForGher(kilnId, cycleSeasonId, cycle.gherId, since, until),
    fuelConsumedForGher(kilnId, cycleSeasonId, cycle.gherId, since, until),
    unloadedSinceForGher(kilnId, cycleSeasonId, cycle.gherId, since, until),
    (async () => {
      const conditions = [eq(chamberGradings.kilnId, kilnId), eq(chamberGradings.gherId, cycle.gherId)];
      if (since) conditions.push(gte(chamberGradings.date, since));
      if (until) conditions.push(lte(chamberGradings.date, until));
      return db.select().from(chamberGradings).where(and(...conditions));
    })(),
  ]);

  const bricksGraded = gradings.reduce((sum, g) => sum + totalBricksOf(g), 0);

  return {
    cycle,
    gherNumber: gher?.number ?? null,
    bricksStacked,
    fuel,
    bricksUnloaded,
    bricksGraded,
    // How much of what was fired came out graded, as a % — the same
    // recovery-percent idea chamberGrading.service.ts already computes per
    // grading event, here rolled up to the whole cycle.
    recoveryPercent: bricksStacked > 0 ? Math.round((bricksGraded / bricksStacked) * 1000) / 10 : null,
    // A round-trip sanity check: unloading labour logged roughly the same
    // count as what actually got graded — a large gap flags either missed
    // Nikasi entries or a grading recorded against the wrong cycle.
    unloadedVsGradedVariance: bricksUnloaded - bricksGraded,
  };
}
