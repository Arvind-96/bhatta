import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { suppliedItems, inventoryItems } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { adjustInventoryQuantity } from "./inventory.service";
import { emitToKiln } from "../config/socket";

export interface CreateSuppliedItemInput {
  kilnId: string;
  seasonId: string;
  personId: string;
  itemId: string;
  quantity: number;
  date?: Date;
  notes?: string;
}

// Giving a labourer an item deducts it from that item's Inventory stock —
// the same quantity, moved from "on hand" to "handed out", so the
// Inventory page's numbers stay accurate without a manual recount.
export async function createSuppliedItem(input: CreateSuppliedItemInput) {
  await assertPersonOfType(input.kilnId, input.personId, ["WORKER", "HELPER"]);
  const item = (await db.select().from(inventoryItems).where(and(eq(inventoryItems._id, input.itemId), eq(inventoryItems.kilnId, input.kilnId))))[0];
  if (!item) throw new Error("Referenced inventory item not found in this kiln");

  const _id = randomUUID();
  await db.insert(suppliedItems).values({ ...input, _id });
  const supplied = (await db.select().from(suppliedItems).where(eq(suppliedItems._id, _id)))[0]!;
  await adjustInventoryQuantity(input.kilnId, input.itemId, -input.quantity);

  emitToKiln(input.kilnId, "suppliedItem:update", supplied);
  return supplied;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// report.service.ts's full person report).
export async function listSuppliedItems(kilnId: string, seasonId: string | null, personId: string) {
  const conditions = [eq(suppliedItems.kilnId, kilnId), eq(suppliedItems.personId, personId)];
  if (seasonId) conditions.push(eq(suppliedItems.seasonId, seasonId));
  const rows = await db.select().from(suppliedItems).where(and(...conditions)).orderBy(desc(suppliedItems.date));
  const itemIds = [...new Set(rows.map((r) => r.itemId))];
  const itemRows = itemIds.length ? await db.select({ _id: inventoryItems._id, name: inventoryItems.name, unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.kilnId, kilnId)) : [];
  const itemById = new Map(itemRows.filter((i) => itemIds.includes(i._id)).map((i) => [i._id, i]));
  return rows.map((r) => ({ ...r, itemId: itemById.get(r.itemId) ?? r.itemId }));
}

export async function deleteSuppliedItem(kilnId: string, suppliedId: string) {
  const deleted = (await db.select().from(suppliedItems).where(and(eq(suppliedItems._id, suppliedId), eq(suppliedItems.kilnId, kilnId))))[0];
  if (!deleted) throw new Error("Supplied item record not found in this kiln");
  await db.delete(suppliedItems).where(eq(suppliedItems._id, suppliedId));
  // Returning the item to stock — this record is being struck off (e.g.
  // logged against the wrong labourer), not "given back" by them.
  await adjustInventoryQuantity(kilnId, deleted.itemId, deleted.quantity);
  emitToKiln(kilnId, "suppliedItem:update", deleted);
  return deleted;
}
