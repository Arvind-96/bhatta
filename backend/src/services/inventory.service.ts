import { randomUUID } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { inventoryItems } from "../db/schema";
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

export async function listInventoryItems(kilnId: string) {
  return db.select().from(inventoryItems).where(eq(inventoryItems.kilnId, kilnId)).orderBy(asc(inventoryItems.name)).all();
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
