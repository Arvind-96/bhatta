import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { chamberGradings, ghers } from "../db/schema";
import { assertGherInKiln } from "./gher.service";
import { stackedSinceForGher } from "./stacking.service";
import { recordStockEntry } from "./stock.service";
import { emitToKiln } from "../config/socket";

export interface CreateGradingInput {
  kilnId: string;
  gherId: string;
  a1Count: number;
  jhamaCount?: number;
  pelaCount?: number;
  rodaCount?: number;
  date?: Date;
  notes?: string;
}

const GRADE_ITEM_NAMES = {
  a1Count: "Bricks (A-1 Grade)",
  jhamaCount: "Bricks (Jhama)",
  pelaCount: "Bricks (Pela/Seem)",
  rodaCount: "Bricks (Roda)",
} as const;

// The chamber-opening entry: how much of what was fired actually came out
// good. Two things happen automatically so the munim never re-enters the
// same numbers twice — finished-goods stock updates per grade, and the
// chamber goes back to EMPTY (ready for the next stacking cycle).
export async function createChamberGrading(input: CreateGradingInput) {
  const gher = await assertGherInKiln(input.kilnId, input.gherId);

  const stackedCount = await stackedSinceForGher(input.kilnId, input.gherId, gher.cycleStartedAt ?? undefined);

  const _id = randomUUID();
  await db.insert(chamberGradings).values({ ...input, _id, stackedCount });
  const grading = (await db.select().from(chamberGradings).where(eq(chamberGradings._id, _id)))[0]!;

  const counts = {
    a1Count: input.a1Count,
    jhamaCount: input.jhamaCount ?? 0,
    pelaCount: input.pelaCount ?? 0,
    rodaCount: input.rodaCount ?? 0,
  };

  for (const [key, itemName] of Object.entries(GRADE_ITEM_NAMES) as [keyof typeof counts, string][]) {
    const quantity = counts[key];
    if (quantity > 0) {
      await recordStockEntry({
        kilnId: input.kilnId,
        type: "FINISHED_GOODS",
        itemName,
        quantity,
      });
    }
  }

  await db.update(ghers).set({ status: "EMPTY", updatedAt: new Date() }).where(eq(ghers._id, input.gherId));

  const recoveryPercent = stackedCount > 0 ? Math.round((counts.a1Count / stackedCount) * 1000) / 10 : null;

  emitToKiln(input.kilnId, "gher:update", (await db.select().from(ghers).where(eq(ghers._id, input.gherId)))[0]);
  emitToKiln(input.kilnId, "grading:update", { ...grading, recoveryPercent });

  return { grading, recoveryPercent };
}

export async function listGradings(kilnId: string, days = 60) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(chamberGradings).where(and(eq(chamberGradings.kilnId, kilnId), gte(chamberGradings.date, since))).orderBy(desc(chamberGradings.date));

  const gherIds = [...new Set(rows.map((r) => r.gherId))];
  const gherRows = gherIds.length ? await db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)) : [];
  const gherById = new Map(gherRows.map((g) => [g._id, g]));

  return rows.map((g) => ({
    ...g,
    gherId: gherById.get(g.gherId) ?? g.gherId,
    recoveryPercent: g.stackedCount && g.stackedCount > 0 ? Math.round((g.a1Count / g.stackedCount) * 1000) / 10 : null,
  }));
}

export async function totalA1Output(kilnId: string, since: Date, until?: Date) {
  const conditions = [eq(chamberGradings.kilnId, kilnId), gte(chamberGradings.date, since)];
  if (until) conditions.push(lte(chamberGradings.date, until));
  const gradings = await db.select().from(chamberGradings).where(and(...conditions));
  return gradings.reduce((sum, g) => sum + g.a1Count, 0);
}
