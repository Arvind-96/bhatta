import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { suppliers, type RateHistoryEntry, type SupplyListItem } from "../db/schema";
import { emitToKiln } from "../config/socket";

function itemKey(itemName: string, unit: string) {
  return `${itemName.trim().toLowerCase()}__${unit}`;
}

// Compares the incoming suppliesList against what's currently on file and
// returns one history entry per item whose rate actually changed value —
// not for a brand-new item or a rate being set for the first time, since
// there's no "previous" rate to show then.
function diffRates(existingList: SupplyListItem[], nextList: SupplyListItem[]): RateHistoryEntry[] {
  const existingByKey = new Map(existingList.map((i) => [itemKey(i.itemName, i.unit), i]));
  const entries: RateHistoryEntry[] = [];
  const effectiveDate = new Date().toISOString().slice(0, 10);
  for (const next of nextList) {
    const prev = existingByKey.get(itemKey(next.itemName, next.unit));
    if (prev?.rate != null && next.rate != null && prev.rate !== next.rate) {
      entries.push({ itemName: next.itemName, unit: next.unit, previousRate: prev.rate, newRate: next.rate, effectiveDate });
    }
  }
  return entries;
}

export interface SupplierInput {
  name: string;
  phone?: string;
  address?: string;
  suppliesList?: SupplyListItem[];
  dateAdded?: Date;
}

export async function createSupplier(kilnId: string, input: SupplierInput) {
  const _id = randomUUID();
  await db.insert(suppliers).values({ ...input, _id, kilnId });
  const row = (await db.select().from(suppliers).where(eq(suppliers._id, _id)))[0]!;
  emitToKiln(kilnId, "supplier:update", row);
  return row;
}

export async function listSuppliers(kilnId: string) {
  return db.select().from(suppliers).where(eq(suppliers.kilnId, kilnId)).orderBy(desc(suppliers.createdAt));
}

export async function updateSupplier(kilnId: string, supplierId: string, input: Partial<SupplierInput>) {
  const existing = (await db.select().from(suppliers).where(and(eq(suppliers._id, supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier not found in this kiln");

  const patch: Partial<typeof suppliers.$inferInsert> = { ...input };
  if (input.suppliesList) {
    const newEntries = diffRates(existing.suppliesList ?? [], input.suppliesList);
    if (newEntries.length > 0) {
      patch.rateHistory = [...(existing.rateHistory ?? []), ...newEntries];
    }
  }

  await db.update(suppliers).set(patch).where(eq(suppliers._id, supplierId));
  const updated = (await db.select().from(suppliers).where(eq(suppliers._id, supplierId)))[0]!;
  emitToKiln(kilnId, "supplier:update", updated);
  return updated;
}

export async function deleteSupplier(kilnId: string, supplierId: string) {
  const existing = (await db.select().from(suppliers).where(and(eq(suppliers._id, supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier not found in this kiln");
  await db.delete(suppliers).where(eq(suppliers._id, supplierId));
  emitToKiln(kilnId, "supplier:update", { _id: supplierId, deleted: true });
}
