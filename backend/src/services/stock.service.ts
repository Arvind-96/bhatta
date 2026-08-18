import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { stockEntries } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreateStockInput {
  kilnId: string;
  type: "RAW_MATERIAL" | "FINISHED_GOODS";
  itemName: string;
  quantity: number;
  unit?: string;
  localId?: string;
}

export async function recordStockEntry(input: CreateStockInput) {
  const existing = input.localId ? (await db.select().from(stockEntries).where(eq(stockEntries.localId, input.localId)))[0] : undefined;

  let entry: typeof stockEntries.$inferSelect;
  if (existing) {
    await db
      .update(stockEntries)
      .set({ quantity: input.quantity, unit: input.unit ?? "units", version: (existing.version ?? 1) + 1 })
      .where(eq(stockEntries._id, existing._id));
    entry = (await db.select().from(stockEntries).where(eq(stockEntries._id, existing._id)))[0]!;
  } else {
    const _id = randomUUID();
    await db.insert(stockEntries).values({
      _id,
      kilnId: input.kilnId,
      type: input.type,
      itemName: input.itemName,
      quantity: input.quantity,
      unit: input.unit ?? "units",
      localId: input.localId,
    });
    entry = (await db.select().from(stockEntries).where(eq(stockEntries._id, _id)))[0]!;
  }

  emitToKiln(input.kilnId, "stock:update", entry);
  return entry;
}

export async function getStockSnapshot(kilnId: string) {
  // Each StockEntry is a delta (grading adds, dispatch/consumption
  // subtracts) that this sums into a running total per item — this has to
  // stay unbounded (no LIMIT) to stay correct; see the QA-pass note this
  // fix came from.
  const entries = await db.select().from(stockEntries).where(eq(stockEntries.kilnId, kilnId)).orderBy(desc(stockEntries.recordedOn));

  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.itemName, (totals.get(entry.itemName) ?? 0) + entry.quantity);
  }

  return Array.from(totals.entries()).map(([itemName, quantity]) => ({ itemName, quantity }));
}
