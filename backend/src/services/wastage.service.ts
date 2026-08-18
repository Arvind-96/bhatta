import { randomUUID } from "crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db/client";
import { wastageLogs } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreateWastageInput {
  kilnId: string;
  type: "SOIL" | "KACCHI_BRICK";
  cause: "RAIN" | "TRANSPORT" | "OTHER";
  quantity: number;
  unit?: string;
  date?: Date;
  notes?: string;
}

export async function logWastage(input: CreateWastageInput) {
  const _id = randomUUID();
  await db.insert(wastageLogs).values({ ...input, _id });
  const entry = (await db.select().from(wastageLogs).where(eq(wastageLogs._id, _id)))[0]!;
  emitToKiln(input.kilnId, "wastage:update", entry);
  return entry;
}

export async function listWastage(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return await db.select().from(wastageLogs).where(and(eq(wastageLogs.kilnId, kilnId), gte(wastageLogs.date, since))).orderBy(desc(wastageLogs.date));
}

export async function totalWastage(kilnId: string, since: Date, type: "SOIL" | "KACCHI_BRICK") {
  const entries = await db.select().from(wastageLogs).where(and(eq(wastageLogs.kilnId, kilnId), eq(wastageLogs.type, type), gte(wastageLogs.date, since)));
  return entries.reduce((sum: number, e: typeof wastageLogs.$inferSelect) => sum + e.quantity, 0);
}
