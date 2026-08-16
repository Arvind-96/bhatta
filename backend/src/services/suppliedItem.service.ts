import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { suppliedItems, inventoryItems } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { adjustInventoryQuantity } from "./inventory.service";
import { emitToKiln } from "../config/socket";

export interface CreateSuppliedItemInput {
  kilnId: string;
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
  const item = db.select().from(inventoryItems).where(and(eq(inventoryItems._id, input.itemId), eq(inventoryItems.kilnId, input.kilnId))).get();
  if (!item) throw new Error("Referenced inventory item not found in this kiln");

  const _id = randomUUID();
  db.insert(suppliedItems).values({ ...input, _id }).run();
  const supplied = db.select().from(suppliedItems).where(eq(suppliedItems._id, _id)).get()!;
  await adjustInventoryQuantity(input.kilnId, input.itemId, -input.quantity);

  emitToKiln(input.kilnId, "suppliedItem:update", supplied);
  return supplied;
}

export async function listSuppliedItems(kilnId: string, personId: string) {
  const rows = await db.select().from(suppliedItems).where(and(eq(suppliedItems.kilnId, kilnId), eq(suppliedItems.personId, personId))).orderBy(desc(suppliedItems.date)).all();
  const itemIds = [...new Set(rows.map((r) => r.itemId))];
  const itemRows = itemIds.length ? await db.select({ _id: inventoryItems._id, name: inventoryItems.name, unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.kilnId, kilnId)).all() : [];
  const itemById = new Map(itemRows.filter((i) => itemIds.includes(i._id)).map((i) => [i._id, i]));
  return rows.map((r) => ({ ...r, itemId: itemById.get(r.itemId) ?? r.itemId }));
}

export async function deleteSuppliedItem(kilnId: string, suppliedId: string) {
  const deleted = db.select().from(suppliedItems).where(and(eq(suppliedItems._id, suppliedId), eq(suppliedItems.kilnId, kilnId))).get();
  if (!deleted) throw new Error("Supplied item record not found in this kiln");
  db.delete(suppliedItems).where(eq(suppliedItems._id, suppliedId)).run();
  // Returning the item to stock — this record is being struck off (e.g.
  // logged against the wrong labourer), not "given back" by them.
  await adjustInventoryQuantity(kilnId, deleted.itemId, deleted.quantity);
  emitToKiln(kilnId, "suppliedItem:update", deleted);
  return deleted;
}
