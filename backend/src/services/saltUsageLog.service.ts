import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { saltUsageLogs } from "../db/schema";
import { assertPathaiSiteInKiln } from "./pathaiSite.service";
import { emitToKiln } from "../config/socket";

export interface CreateSaltUsageLogInput {
  kilnId: string;
  seasonId: string;
  siteId: string;
  quantityKg: number;
  date?: Date;
  notes?: string;
}

export async function createSaltUsageLog(input: CreateSaltUsageLogInput) {
  await assertPathaiSiteInKiln(input.kilnId, input.siteId);
  const _id = randomUUID();
  await db.insert(saltUsageLogs).values({ ...input, _id });
  const log = (await db.select().from(saltUsageLogs).where(eq(saltUsageLogs._id, _id)))[0]!;
  emitToKiln(input.kilnId, "saltUsageLog:update", log);
  return log;
}

export interface ListSaltUsageLogFilter {
  siteId?: string;
  from?: Date;
  to?: Date;
}

export async function listSaltUsageLogs(kilnId: string, filter: ListSaltUsageLogFilter = {}) {
  const conditions = [eq(saltUsageLogs.kilnId, kilnId)];
  if (filter.siteId) conditions.push(eq(saltUsageLogs.siteId, filter.siteId));
  if (filter.from) conditions.push(gte(saltUsageLogs.date, filter.from));
  if (filter.to) conditions.push(lte(saltUsageLogs.date, filter.to));
  return db.select().from(saltUsageLogs).where(and(...conditions)).orderBy(desc(saltUsageLogs.date));
}

export async function deleteSaltUsageLog(kilnId: string, logId: string) {
  const existing = (await db.select().from(saltUsageLogs).where(and(eq(saltUsageLogs._id, logId), eq(saltUsageLogs.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Salt usage log not found in this kiln");
  await db.delete(saltUsageLogs).where(eq(saltUsageLogs._id, logId));
  emitToKiln(kilnId, "saltUsageLog:update", { _id: logId, deleted: true });
}
