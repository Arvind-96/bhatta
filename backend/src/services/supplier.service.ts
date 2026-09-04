import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { suppliers, supplierInvoices, purchaseOrders, fuelPurchases, type RateHistoryEntry, type SupplyListItem } from "../db/schema";
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

// Every real supplier lives in this dedicated table, not the generic
// `people` table's legacy SUPPLIER type — see fuelPurchase.service.ts's
// createFuelPurchase for a caller that used to (wrongly) validate against
// `people` instead, the same duplicate-table mistake dispatch.service.ts's
// assertCustomerInKiln was added to fix for customers.
export async function assertSupplierInKiln(kilnId: string, supplierId: string) {
  const supplier = (await db.select({ _id: suppliers._id }).from(suppliers).where(and(eq(suppliers._id, supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!supplier) throw new Error("Referenced supplier not found in this kiln");
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

// No DB-level FK ties supplier_invoices/purchase_orders/fuel_purchases back
// to suppliers, so a hard delete here used to silently orphan them — the
// invoice's real due vanished from Debtors & Creditors/Trial Balance (both
// loop `listSuppliers` to find it), and a PENDING purchase order referencing
// the deleted supplier could never be fulfilled again ("Supplier not found
// in this kiln", thrown from inside createSupplierInvoice). Guarded the
// same check-then-throw way as deleteCustomer/deleteVehicle/
// deleteBrickCategory: refuse instead of deleting when real history exists.
export async function deleteSupplier(kilnId: string, supplierId: string) {
  const existing = (await db.select().from(suppliers).where(and(eq(suppliers._id, supplierId), eq(suppliers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Supplier not found in this kiln");

  const [linkedInvoices, linkedOrders, linkedFuelPurchases] = await Promise.all([
    db.select({ _id: supplierInvoices._id }).from(supplierInvoices).where(and(eq(supplierInvoices.kilnId, kilnId), eq(supplierInvoices.supplierId, supplierId))),
    db.select({ _id: purchaseOrders._id }).from(purchaseOrders).where(and(eq(purchaseOrders.kilnId, kilnId), eq(purchaseOrders.supplierId, supplierId))),
    db.select({ _id: fuelPurchases._id }).from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), eq(fuelPurchases.supplierId, supplierId))),
  ]);
  if (linkedInvoices.length > 0 || linkedOrders.length > 0 || linkedFuelPurchases.length > 0) {
    throw new Error(
      `Cannot delete this supplier — ${linkedInvoices.length} invoice(s), ${linkedOrders.length} purchase order(s), and ${linkedFuelPurchases.length} fuel purchase(s) are linked to them. Those records would become untraceable.`
    );
  }

  await db.delete(suppliers).where(eq(suppliers._id, supplierId));
  emitToKiln(kilnId, "supplier:update", { _id: supplierId, deleted: true });
}
