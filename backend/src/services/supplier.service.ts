import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { suppliers, type SupplyListItem } from "../db/schema";
import { emitToKiln } from "../config/socket";

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
  await db.update(suppliers).set(input).where(eq(suppliers._id, supplierId));
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
