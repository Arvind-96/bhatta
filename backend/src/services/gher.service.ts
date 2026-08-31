import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { ghers, fireMovementLogs, gherCycles, GHER_STATUSES } from "../db/schema";
import { emitToKiln } from "../config/socket";

export type GherStatus = (typeof GHER_STATUSES)[number];

// Called once from Settings when the owner configures how many chambers
// their kiln has. Safe to call again with a larger count later (adds the
// new ones only) — never shrinks or touches existing chambers' status.
export async function ensureGherCount(kilnId: string, count: number) {
  const existing = await db.select().from(ghers).where(eq(ghers.kilnId, kilnId)).orderBy(asc(ghers.number));
  const existingNumbers = new Set(existing.map((g) => g.number));

  for (let n = 1; n <= count; n++) {
    if (!existingNumbers.has(n)) {
      await db.insert(ghers).values({ _id: randomUUID(), kilnId, number: n });
    }
  }

  return listGhers(kilnId);
}

export async function listGhers(kilnId: string) {
  return db.select().from(ghers).where(eq(ghers.kilnId, kilnId)).orderBy(asc(ghers.number));
}

// Returns the most recently started cycle row for this chamber — the one
// STACKING's own insert below always creates immediately before any of
// FIRING/READY/UNLOADING/EMPTY could be reached, so this is always the
// "open" cycle those transitions should update. Never throws when none
// exists (a chamber whose whole lifecycle predates this table) — those
// later transitions simply have no history row to fill in, which is fine.
async function currentCycle(gherId: string) {
  return (await db.select().from(gherCycles).where(eq(gherCycles.gherId, gherId)).orderBy(desc(gherCycles.cycleNumber)))[0];
}

export async function updateGherStatus(kilnId: string, seasonId: string, gherId: string, status: GherStatus) {
  const update: Record<string, unknown> = { status, updatedAt: new Date() };
  // A fresh STACKING stage marks the start of a new firing cycle — this is
  // the boundary chamberGrading.service.ts uses to scope "bricks stacked
  // this cycle" instead of summing every stacking entry ever logged here.
  if (status === "STACKING") update.cycleStartedAt = new Date();

  const existing = (await db.select().from(ghers).where(and(eq(ghers._id, gherId), eq(ghers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Chamber not found in this kiln");

  await db.update(ghers).set(update).where(eq(ghers._id, gherId));
  const gher = (await db.select().from(ghers).where(eq(ghers._id, gherId)))[0]!;

  if (status === "FIRING") {
    await db.insert(fireMovementLogs).values({ _id: randomUUID(), kilnId, seasonId, gherId: gher._id, gherNumber: gher.number });
  }

  // Historical cycle tracking — see gherCycles' own doc comment in
  // db/schema/production.ts. STACKING always starts a brand-new row (never
  // reuses one); every later stage fills in the timestamp on whichever
  // cycle row is currently open for this chamber.
  const now = new Date();
  if (status === "STACKING") {
    const maxRow = (await db.select({ max: sql<number | null>`max(${gherCycles.cycleNumber})` }).from(gherCycles).where(eq(gherCycles.gherId, gherId)))[0];
    const cycleNumber = (maxRow?.max ?? 0) + 1;
    await db.insert(gherCycles).values({ _id: randomUUID(), kilnId, seasonId, gherId, cycleNumber, stackingStartedAt: now });
  } else {
    const open = await currentCycle(gherId);
    if (open) {
      if (status === "FIRING") await db.update(gherCycles).set({ firingStartedAt: now }).where(eq(gherCycles._id, open._id));
      else if (status === "READY") await db.update(gherCycles).set({ readyAt: now }).where(eq(gherCycles._id, open._id));
      else if (status === "UNLOADING") await db.update(gherCycles).set({ unloadingStartedAt: now }).where(eq(gherCycles._id, open._id));
      else if (status === "EMPTY") await db.update(gherCycles).set({ completedAt: now }).where(eq(gherCycles._id, open._id));
    }
  }

  emitToKiln(kilnId, "gher:update", gher);
  return gher;
}

export async function assertGherInKiln(kilnId: string, gherId: string) {
  const gher = (await db.select().from(ghers).where(and(eq(ghers._id, gherId), eq(ghers.kilnId, kilnId))))[0];
  if (!gher) throw new Error("Referenced chamber not found in this kiln");
  return gher;
}

// "1 to 1.5 chambers/day" is the healthy range quoted on-site — this just
// counts how many FIRING transitions happened in the window and divides by
// days, which is the practical measure of round speed.
export async function fireRoundSpeed(kilnId: string, seasonId: string, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [movements, currentRows] = await Promise.all([
    db.select().from(fireMovementLogs).where(and(eq(fireMovementLogs.kilnId, kilnId), eq(fireMovementLogs.seasonId, seasonId), gte(fireMovementLogs.startedAt, since))).orderBy(desc(fireMovementLogs.startedAt)),
    db.select().from(ghers).where(and(eq(ghers.kilnId, kilnId), eq(ghers.status, "FIRING"))).orderBy(desc(ghers.updatedAt)),
  ]);
  const current = currentRows[0];

  return {
    days,
    chambersMoved: movements.length,
    chambersPerDay: movements.length > 0 ? Math.round((movements.length / days) * 100) / 100 : 0,
    currentFireGherNumber: current?.number ?? null,
    recentMovements: movements.slice(0, 10),
  };
}
