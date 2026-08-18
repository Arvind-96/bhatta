import { randomUUID } from "crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db/client";
import { stockAudits } from "../db/schema";
import { getStockSnapshot } from "./stock.service";
import { emitToKiln } from "../config/socket";

export interface CreateStockAuditInput {
  kilnId: string;
  itemName: string;
  physicalCount: number;
  date?: Date;
  notes?: string;
}

// registerCount is read from the system's own snapshot at the moment of
// audit, not entered by hand — the variance is only meaningful if one side
// of the comparison is guaranteed to be what the software actually
// believes, not what the munim remembers it being.
export async function createStockAudit(input: CreateStockAuditInput) {
  const snapshot = await getStockSnapshot(input.kilnId);
  const registerCount = snapshot.find((s) => s.itemName === input.itemName)?.quantity ?? 0;
  const variance = input.physicalCount - registerCount;

  const _id = randomUUID();
  await db.insert(stockAudits).values({ ...input, _id, registerCount, variance });
  const audit = (await db.select().from(stockAudits).where(eq(stockAudits._id, _id)))[0]!;
  emitToKiln(input.kilnId, "stockAudit:update", audit);
  return audit;
}

export async function listStockAudits(kilnId: string, days = 365) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return await db.select().from(stockAudits).where(and(eq(stockAudits.kilnId, kilnId), gte(stockAudits.date, since))).orderBy(desc(stockAudits.date));
}
