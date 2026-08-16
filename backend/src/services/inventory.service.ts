import { randomUUID } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { inventoryItems, suppliedItems } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreateInventoryItemInput {
  kilnId: string;
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export async function createInventoryItem(input: CreateInventoryItemInput) {
  const _id = randomUUID();
  db.insert(inventoryItems).values({ ...input, _id }).run();
  const item = db.select().from(inventoryItems).where(eq(inventoryItems._id, _id)).get()!;
  emitToKiln(input.kilnId, "inventory:update", item);
  return item;
}

// `usedQuantity` is the running total ever handed out to labourers
// (suppliedItems, never reversed except by deleting the specific record
// that over/under-counted it) — shown alongside the live `quantity`
// remaining so the admin sees both "left" and "used" on the same screen,
// not just the live balance.
export async function listInventoryItems(kilnId: string) {
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.kilnId, kilnId)).orderBy(asc(inventoryItems.name)).all();
  const usedRows = await db
    .select({ itemId: suppliedItems.itemId, used: sql<number>`sum(${suppliedItems.quantity})` })
    .from(suppliedItems)
    .where(eq(suppliedItems.kilnId, kilnId))
    .groupBy(suppliedItems.itemId)
    .all();
  const usedByItemId = new Map(usedRows.map((r) => [r.itemId, r.used]));
  return items.map((item) => ({ ...item, usedQuantity: usedByItemId.get(item._id) ?? 0 }));
}

export interface UpdateInventoryItemInput {
  name?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export async function updateInventoryItem(kilnId: string, itemId: string, input: UpdateInventoryItemInput) {
  const existing = db.select().from(inventoryItems).where(and(eq(inventoryItems._id, itemId), eq(inventoryItems.kilnId, kilnId))).get();
  if (!existing) throw new Error("Inventory item not found in this kiln");
  db.update(inventoryItems).set(input).where(eq(inventoryItems._id, itemId)).run();
  const updated = db.select().from(inventoryItems).where(eq(inventoryItems._id, itemId)).get()!;
  emitToKiln(kilnId, "inventory:update", updated);
  return updated;
}

export async function deleteInventoryItem(kilnId: string, itemId: string) {
  const existing = db.select().from(inventoryItems).where(and(eq(inventoryItems._id, itemId), eq(inventoryItems.kilnId, kilnId))).get();
  if (!existing) throw new Error("Inventory item not found in this kiln");
  db.delete(inventoryItems).where(eq(inventoryItems._id, itemId)).run();
  emitToKiln(kilnId, "inventory:update", { _id: itemId, deleted: true });
  return existing;
}

// Called by suppliedItem.service.ts when something is handed out to a
// labourer — a plain increment/decrement, allowed to go negative (flagged
// via the UI, never blocked) same as every other "did we overcommit"
// check in this app (contract overruns, loading count mismatches, etc.).
export async function adjustInventoryQuantity(kilnId: string, itemId: string, delta: number) {
  const existing = db.select().from(inventoryItems).where(and(eq(inventoryItems._id, itemId), eq(inventoryItems.kilnId, kilnId))).get();
  if (!existing) throw new Error("Inventory item not found in this kiln");
  db.update(inventoryItems).set({ quantity: sql`${inventoryItems.quantity} + ${delta}` }).where(eq(inventoryItems._id, itemId)).run();
  const updated = db.select().from(inventoryItems).where(eq(inventoryItems._id, itemId)).get()!;
  emitToKiln(kilnId, "inventory:update", updated);
  return updated;
}
