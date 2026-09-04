import { randomUUID } from "crypto";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
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
  await db.insert(inventoryItems).values({ ...input, _id });
  const item = (await db.select().from(inventoryItems).where(eq(inventoryItems._id, _id)))[0]!;
  emitToKiln(input.kilnId, "inventory:update", item);
  return item;
}

// `usedQuantity` is the running total ever handed out to labourers
// (suppliedItems, never reversed except by deleting the specific record
// that over/under-counted it) — shown alongside the live `quantity`
// remaining so the admin sees both "left" and "used" on the same screen,
// not just the live balance.
export async function listInventoryItems(kilnId: string) {
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.kilnId, kilnId)).orderBy(asc(inventoryItems.name));
  const usedRows = await db
    .select({ itemId: suppliedItems.itemId, used: sql<number>`sum(${suppliedItems.quantity})` })
    .from(suppliedItems)
    .where(eq(suppliedItems.kilnId, kilnId))
    .groupBy(suppliedItems.itemId);
  const usedByItemId = new Map(usedRows.map((r) => [r.itemId, r.used]));
  return items.map((item) => ({ ...item, usedQuantity: usedByItemId.get(item._id) ?? 0 }));
}

// Same shape as listInventoryItems' all-time usedQuantity, but scoped to a
// date range — the Inventory report's "used this period" column, alongside
// the item's live (all-time) remaining quantity.
// seasonId is nullable — pass null for an all-time, every-season view
// (the only current caller, the Inventory report, always does).
export async function listInventoryItemsForPeriod(kilnId: string, seasonId: string | null, filter: { from?: Date; to?: Date } = {}) {
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.kilnId, kilnId)).orderBy(asc(inventoryItems.name));
  const conditions = [eq(suppliedItems.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(suppliedItems.seasonId, seasonId));
  if (filter.from) conditions.push(gte(suppliedItems.date, filter.from));
  if (filter.to) conditions.push(lte(suppliedItems.date, filter.to));
  const usedRows = await db
    .select({ itemId: suppliedItems.itemId, used: sql<number>`sum(${suppliedItems.quantity})` })
    .from(suppliedItems)
    .where(and(...conditions))
    .groupBy(suppliedItems.itemId);
  const usedByItemId = new Map(usedRows.map((r) => [r.itemId, r.used]));
  return items.map((item) => ({ ...item, usedInPeriod: usedByItemId.get(item._id) ?? 0 }));
}

export interface UpdateInventoryItemInput {
  name?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export async function updateInventoryItem(kilnId: string, itemId: string, input: UpdateInventoryItemInput) {
  const existing = (await db.select().from(inventoryItems).where(and(eq(inventoryItems._id, itemId), eq(inventoryItems.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Inventory item not found in this kiln");
  await db.update(inventoryItems).set(input).where(eq(inventoryItems._id, itemId));
  const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems._id, itemId)))[0]!;
  emitToKiln(kilnId, "inventory:update", updated);
  return updated;
}

// No DB-level FK ties suppliedItems.itemId back to inventoryItems, so a
// hard delete here used to silently orphan them — a worker's supply
// history would resolve the item to a raw id string instead of its name,
// permanently. Guarded the same check-then-throw way as deleteCustomer/
// deleteVehicle/deleteBrickCategory/deleteSupplier.
export async function deleteInventoryItem(kilnId: string, itemId: string) {
  const existing = (await db.select().from(inventoryItems).where(and(eq(inventoryItems._id, itemId), eq(inventoryItems.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Inventory item not found in this kiln");

  const linkedSupplies = await db.select({ _id: suppliedItems._id }).from(suppliedItems).where(and(eq(suppliedItems.kilnId, kilnId), eq(suppliedItems.itemId, itemId)));
  if (linkedSupplies.length > 0) {
    throw new Error(`Cannot delete this item — it's been supplied to workers ${linkedSupplies.length} time(s). That history would become untraceable.`);
  }

  await db.delete(inventoryItems).where(eq(inventoryItems._id, itemId));
  emitToKiln(kilnId, "inventory:update", { _id: itemId, deleted: true });
  return existing;
}

// Called by suppliedItem.service.ts when something is handed out to a
// labourer — a plain increment/decrement, allowed to go negative (flagged
// via the UI, never blocked) same as every other "did we overcommit"
// check in this app (contract overruns, loading count mismatches, etc.).
export async function adjustInventoryQuantity(kilnId: string, itemId: string, delta: number) {
  const existing = (await db.select().from(inventoryItems).where(and(eq(inventoryItems._id, itemId), eq(inventoryItems.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Inventory item not found in this kiln");
  await db.update(inventoryItems).set({ quantity: sql`${inventoryItems.quantity} + ${delta}` }).where(eq(inventoryItems._id, itemId));
  const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems._id, itemId)))[0]!;
  emitToKiln(kilnId, "inventory:update", updated);
  return updated;
}
