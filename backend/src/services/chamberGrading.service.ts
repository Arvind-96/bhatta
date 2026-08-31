import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { chamberGradings, ghers, brickCategories } from "../db/schema";
import type { BrickLineItem } from "../db/schema/_helpers";
import { assertGherInKiln } from "./gher.service";
import { stackedSinceForGher } from "./stacking.service";
import { createBrickProductionEntry } from "./brickCategory.service";
import { emitToKiln } from "../config/socket";

export interface GradingItemInput {
  categoryId: string;
  bricksCount: number;
}

export interface CreateGradingInput {
  kilnId: string;
  seasonId: string;
  gherId: string;
  // The kiln's own Brick Categories, however many the admin has set up —
  // replaces the old fixed A1/Jhama/Pela/Roda split. Each line credits
  // real, dispatchable stock (see createBrickProductionEntry below), not
  // just a dashboard-only figure.
  items: GradingItemInput[];
  date?: Date;
  notes?: string;
}

export function totalBricksOf(row: { a1Count: number; jhamaCount: number; pelaCount: number; rodaCount: number; items: BrickLineItem[] | null }): number {
  if (row.items && row.items.length > 0) return row.items.reduce((sum, i) => sum + i.bricksCount, 0);
  return row.a1Count + row.jhamaCount + row.pelaCount + row.rodaCount;
}

// The chamber-opening entry: how much of what was fired actually came out
// good, broken down by the kiln's own brick categories. Three things
// happen automatically so the munim never re-enters the same numbers
// twice — each category's real stock updates (via
// brickCategory.service.ts's createBrickProductionEntry, the same
// mechanism the Stock page's own production log uses), the chamber goes
// back to EMPTY (ready for the next stacking cycle), and a fresh
// UNLOADING→EMPTY transition is recorded the same way READY→EMPTY used to
// happen automatically before the UNLOADING status existed.
export async function createChamberGrading(input: CreateGradingInput) {
  const gher = await assertGherInKiln(input.kilnId, input.gherId);
  const stackedCount = await stackedSinceForGher(input.kilnId, input.seasonId, input.gherId, gher.cycleStartedAt ?? undefined);

  const validItems = input.items.filter((i) => i.bricksCount > 0).map((i) => ({ categoryId: i.categoryId, bricksCount: i.bricksCount }));
  const totalOutput = validItems.reduce((sum, i) => sum + i.bricksCount, 0);

  const _id = randomUUID();
  await db.insert(chamberGradings).values({ _id, kilnId: input.kilnId, seasonId: input.seasonId, gherId: input.gherId, items: validItems, stackedCount, date: input.date, notes: input.notes });
  const grading = (await db.select().from(chamberGradings).where(eq(chamberGradings._id, _id)))[0]!;

  for (const item of validItems) {
    await createBrickProductionEntry({
      kilnId: input.kilnId,
      seasonId: input.seasonId,
      categoryId: item.categoryId,
      bricksCount: item.bricksCount,
      date: input.date,
      notes: `Chamber #${gher.number} grading`,
    });
  }

  await db.update(ghers).set({ status: "EMPTY", updatedAt: new Date() }).where(eq(ghers._id, input.gherId));

  // Overall yield (every category combined) — a well-defined figure
  // regardless of which categories this kiln happens to have set up,
  // unlike the old A1-specific recovery% (see totalA1Output below for
  // where the A1-specific figure still lives, for the callers that
  // genuinely need just the top grade).
  const recoveryPercent = stackedCount > 0 ? Math.round((totalOutput / stackedCount) * 1000) / 10 : null;

  emitToKiln(input.kilnId, "gher:update", (await db.select().from(ghers).where(eq(ghers._id, input.gherId)))[0]);
  emitToKiln(input.kilnId, "grading:update", { ...grading, totalOutput, recoveryPercent });

  return { grading, totalOutput, recoveryPercent };
}

export async function listGradings(kilnId: string, seasonId: string, days = 60) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(chamberGradings).where(and(eq(chamberGradings.kilnId, kilnId), eq(chamberGradings.seasonId, seasonId), gte(chamberGradings.date, since))).orderBy(desc(chamberGradings.date));

  const gherIds = [...new Set(rows.map((r) => r.gherId))];
  const gherRows = gherIds.length ? await db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)) : [];
  const gherById = new Map(gherRows.map((g) => [g._id, g]));

  const categoryIds = [...new Set(rows.flatMap((r) => (r.items ?? []).map((i) => i.categoryId).filter((id): id is string => !!id)))];
  const categoryRows = categoryIds.length
    ? await db.select({ _id: brickCategories._id, category: brickCategories.category, grade: brickCategories.grade }).from(brickCategories).where(inArray(brickCategories._id, categoryIds))
    : [];
  const categoryById = new Map(categoryRows.map((c) => [c._id, c]));

  return rows.map((g) => {
    const totalOutput = totalBricksOf(g);
    return {
      ...g,
      gherId: gherById.get(g.gherId) ?? g.gherId,
      items: (g.items ?? []).map((i) => ({ ...i, categoryId: i.categoryId ? categoryById.get(i.categoryId) ?? i.categoryId : i.categoryId })),
      totalOutput,
      recoveryPercent: g.stackedCount && g.stackedCount > 0 ? Math.round((totalOutput / g.stackedCount) * 1000) / 10 : null,
    };
  });
}

// seasonIds, not a single seasonId — see dispatch.service.ts's
// totalDispatchedSince for the convention. Counts a grading's contribution
// to "A1 output" two ways depending on which system produced it: legacy
// rows (pre-Brick-Categories) via their own stored a1Count column; rows
// graded since then via items whose linked category is tagged grade "A1"
// (case-insensitive — the same free-text convention brickCategories.grade
// already used before this). A kiln that never tags any category "A1"
// will read as 0 A1 output here going forward — reconciliation/compare/
// firing-efficiency all key off this figure specifically, not total output.
export async function totalA1Output(kilnId: string, seasonIds: string[], since: Date, until?: Date) {
  const conditions = [eq(chamberGradings.kilnId, kilnId), inArray(chamberGradings.seasonId, seasonIds), gte(chamberGradings.date, since)];
  if (until) conditions.push(lte(chamberGradings.date, until));
  const gradings = await db.select().from(chamberGradings).where(and(...conditions));

  const legacyA1 = gradings.reduce((sum, g) => sum + g.a1Count, 0);

  const categoryIds = [...new Set(gradings.flatMap((g) => (g.items ?? []).map((i) => i.categoryId).filter((id): id is string => !!id)))];
  if (categoryIds.length === 0) return legacyA1;

  const categoryRows = await db.select({ _id: brickCategories._id, grade: brickCategories.grade }).from(brickCategories).where(inArray(brickCategories._id, categoryIds));
  const a1CategoryIds = new Set(categoryRows.filter((c) => (c.grade ?? "").trim().toLowerCase() === "a1").map((c) => c._id));

  const newA1 = gradings.reduce((sum, g) => {
    const gradingA1 = (g.items ?? []).filter((i) => i.categoryId && a1CategoryIds.has(i.categoryId)).reduce((s, i) => s + i.bricksCount, 0);
    return sum + gradingA1;
  }, 0);

  return legacyA1 + newA1;
}

// Every graded brick, every category combined — the denominator for a
// kiln-wide ₹/brick figure (see financialReport.service.ts's
// seasonFinancialSummary), unlike totalA1Output's grade-specific figure
// above.
export async function totalGradedOutput(kilnId: string, seasonId: string, since: Date) {
  const gradings = await db.select().from(chamberGradings).where(and(eq(chamberGradings.kilnId, kilnId), eq(chamberGradings.seasonId, seasonId), gte(chamberGradings.date, since)));
  return gradings.reduce((sum, g) => sum + totalBricksOf(g), 0);
}
