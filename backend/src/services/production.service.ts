import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "../db/client";
import { productionLogs } from "../db/schema";
import { addLedgerEntry } from "./ledger.service";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export interface CreateProductionInput {
  kilnId: string;
  batchNumber: string;
  bricksCount: number;
  qualityGrade?: string;
  thekedarId?: string;
  producedOn?: Date;
  localId?: string;
}

// localId (set by the on-site sync engine) is the idempotency key: a retried
// push finds the existing row and bumps its version instead of duplicating it.
export async function createProductionLog(input: CreateProductionInput) {
  const thekedar = input.thekedarId
    ? await assertPersonOfType(input.kilnId, input.thekedarId, ["THEKEDAR"])
    : null;

  let log: typeof productionLogs.$inferSelect;
  let wasCreated: boolean;

  const existing = input.localId
    ? (await db.select().from(productionLogs).where(eq(productionLogs.localId, input.localId)))[0]
    : undefined;

  if (existing) {
    await db
      .update(productionLogs)
      .set({ bricksCount: input.bricksCount, qualityGrade: input.qualityGrade ?? "A", version: (existing.version ?? 1) + 1 })
      .where(eq(productionLogs._id, existing._id));
    log = (await db.select().from(productionLogs).where(eq(productionLogs._id, existing._id)))[0]!;
    wasCreated = false;
  } else {
    const _id = randomUUID();
    await db.insert(productionLogs).values({
      _id,
      kilnId: input.kilnId,
      batchNumber: input.batchNumber,
      bricksCount: input.bricksCount,
      qualityGrade: input.qualityGrade ?? "A",
      thekedarId: input.thekedarId,
      producedOn: input.producedOn ?? new Date(),
      localId: input.localId,
      version: 1,
    });
    log = (await db.select().from(productionLogs).where(eq(productionLogs._id, _id)))[0]!;
    wasCreated = true;
  }

  // Only the actual create posts the thekedar's contract payment — guards
  // against a retried sync push (same localId, finds the existing row)
  // posting it a second time.
  if (thekedar && wasCreated) {
    if (thekedar.contractRate) {
      await addLedgerEntry({
        kilnId: input.kilnId,
        personId: thekedar._id,
        direction: "DUE",
        amount: (input.bricksCount / 1000) * thekedar.contractRate,
        reason: `Contract firing: batch ${input.batchNumber}, ${input.bricksCount.toLocaleString()} bricks`,
        date: input.producedOn,
      });
    }
  }

  emitToKiln(input.kilnId, "production:update", log);
  return log;
}

export async function getTodayProduction(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return await db.select().from(productionLogs).where(and(eq(productionLogs.kilnId, kilnId), gte(productionLogs.producedOn, startOfDay))).orderBy(desc(productionLogs.producedOn));
}

export async function getProductionSeries(kilnId: string, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await db.select().from(productionLogs).where(and(eq(productionLogs.kilnId, kilnId), gte(productionLogs.producedOn, since))).orderBy(asc(productionLogs.producedOn));

  const byDay = new Map<string, number>();
  for (const log of logs) {
    const key = log.producedOn!.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + log.bricksCount);
  }

  return Array.from(byDay.entries()).map(([date, bricks]) => ({ date, bricks }));
}
