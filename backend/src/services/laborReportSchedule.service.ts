import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { kilns, laborReportRuns } from "../db/schema";

export async function getLaborReportScheduleDays(kilnId: string) {
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln.laborReportScheduleDays ?? [];
}

export async function setLaborReportScheduleDays(kilnId: string, days: number[]) {
  const uniqueSortedDays = [...new Set(days)].sort((a, b) => a - b);
  await db.update(kilns).set({ laborReportScheduleDays: uniqueSortedDays }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function listLaborReportRuns(kilnId: string) {
  return db.select().from(laborReportRuns).where(eq(laborReportRuns.kilnId, kilnId)).orderBy(desc(laborReportRuns.periodEnd));
}

// Called once a day (see index.ts's cron.schedule) — for every kiln that
// has picked at least one day-of-month, checks whether today is one of
// them, and if so records a new period boundary running from the day
// after its last recorded one (or the start of this month, for the very
// first run) through today. Never touches molding/stacking/nikasi data
// itself; see laborReportRuns' own doc comment for why. Idempotent via the
// table's own unique index — a second call the same day for a kiln that
// already has a run is a no-op given the identical period bounds.
export async function runScheduledLaborReportGeneration(today: Date = new Date()) {
  const dayOfMonth = today.getDate();
  const allKilns = await db.select().from(kilns);
  const results: { kilnId: string; periodStart: Date; periodEnd: Date }[] = [];

  for (const kiln of allKilns) {
    const scheduleDays = kiln.laborReportScheduleDays ?? [];
    if (!scheduleDays.includes(dayOfMonth)) continue;

    const lastRun = (await db.select().from(laborReportRuns).where(eq(laborReportRuns.kilnId, kiln._id)).orderBy(desc(laborReportRuns.periodEnd)))[0];
    const periodEnd = new Date(today);
    periodEnd.setHours(0, 0, 0, 0);
    let periodStart: Date;
    if (lastRun) {
      periodStart = new Date(lastRun.periodEnd);
      periodStart.setDate(periodStart.getDate() + 1);
    } else {
      periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
    }
    if (periodStart > periodEnd) continue; // already generated today

    const existing = (await db.select().from(laborReportRuns).where(and(eq(laborReportRuns.kilnId, kiln._id), eq(laborReportRuns.periodStart, periodStart), eq(laborReportRuns.periodEnd, periodEnd))))[0];
    if (existing) continue;

    await db.insert(laborReportRuns).values({ _id: randomUUID(), kilnId: kiln._id, periodStart, periodEnd });
    results.push({ kilnId: kiln._id, periodStart, periodEnd });
  }

  return results;
}
