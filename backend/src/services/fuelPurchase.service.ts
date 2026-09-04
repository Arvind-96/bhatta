import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { fuelPurchases, fuelLogs, suppliers, LEDGER_PAYMENT_MODES } from "../db/schema";
import { assertSupplierInKiln } from "./supplier.service";
import { assertFuelTypeExists } from "./fuelType.service";
import { seasonIdsThrough } from "./season.util";
import { emitToKiln } from "../config/socket";

const WEIGHT_VARIANCE_ALERT_THRESHOLD = 0.03; // 3%

export interface CreateFuelPurchaseInput {
  kilnId: string;
  seasonId: string;
  fuelType: string;
  supplierId?: string;
  vehicleNumber?: string;
  invoicedWeightKg: number;
  actualWeightKg: number;
  amount: number;
  paidAmount?: number;
  paymentMode?: Exclude<(typeof LEDGER_PAYMENT_MODES)[number], "CASH_AND_ONLINE">;
  date?: Date;
  notes?: string;
}

// Weighed in and, if a supplier is on record, billed against them — same
// "due = amount - paidAmount, computed live off the row itself, never a
// separately-posted ledger fact" pattern getSupplierDetail uses for goods
// invoices (see supplierFuelBalances below). Deliberately does NOT post to
// ledgerEntries: addLedgerEntry validates personId against the generic
// `people` table, but a real supplierId lives in the dedicated `suppliers`
// table (see assertSupplierInKiln) — the two are mutually exclusive, so
// there's no valid way to post one here, and no need to either.
export async function createFuelPurchase(input: CreateFuelPurchaseInput) {
  await assertFuelTypeExists(input.kilnId, input.fuelType);
  if (input.supplierId) {
    await assertSupplierInKiln(input.kilnId, input.supplierId);
  }

  const _id = randomUUID();
  await db.insert(fuelPurchases).values({ ...input, _id });
  const purchase = (await db.select().from(fuelPurchases).where(eq(fuelPurchases._id, _id)))[0]!;

  const shortfall = input.invoicedWeightKg - input.actualWeightKg;
  const variance = input.invoicedWeightKg > 0 ? shortfall / input.invoicedWeightKg : 0;

  emitToKiln(input.kilnId, "fuelPurchase:update", {
    ...purchase,
    shortfallKg: shortfall,
    variancePercent: Math.round(variance * 1000) / 10,
    alert: variance > WEIGHT_VARIANCE_ALERT_THRESHOLD,
  });

  return purchase;
}

export interface UpdateFuelPurchaseInput {
  fuelType?: string;
  vehicleNumber?: string;
  invoicedWeightKg?: number;
  actualWeightKg?: number;
  amount?: number;
  paidAmount?: number;
  paymentMode?: Exclude<(typeof LEDGER_PAYMENT_MODES)[number], "CASH_AND_ONLINE">;
  notes?: string;
}

// Full admin edit — amount/paidAmount are plain columns read live by
// supplierFuelBalances below, so correcting either here is simply a
// straight update, no separate ledger correction entry to post or keep in
// sync (see createFuelPurchase's own note on why this never touches
// ledgerEntries at all).
export async function updateFuelPurchase(kilnId: string, purchaseId: string, input: UpdateFuelPurchaseInput) {
  const existing = (await db.select().from(fuelPurchases).where(and(eq(fuelPurchases._id, purchaseId), eq(fuelPurchases.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Fuel purchase not found in this kiln");
  if (input.fuelType) await assertFuelTypeExists(kilnId, input.fuelType);

  await db.update(fuelPurchases).set(input).where(eq(fuelPurchases._id, purchaseId));
  const updated = (await db.select().from(fuelPurchases).where(eq(fuelPurchases._id, purchaseId)))[0]!;

  emitToKiln(kilnId, "fuelPurchase:update", updated);
  return updated;
}

export async function deleteFuelPurchase(kilnId: string, purchaseId: string) {
  const existing = (await db.select().from(fuelPurchases).where(and(eq(fuelPurchases._id, purchaseId), eq(fuelPurchases.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Fuel purchase not found in this kiln");

  await db.delete(fuelPurchases).where(eq(fuelPurchases._id, purchaseId));
  emitToKiln(kilnId, "fuelPurchase:update", { _id: purchaseId, deleted: true });
}

export async function listFuelPurchases(kilnId: string, seasonId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), eq(fuelPurchases.seasonId, seasonId), gte(fuelPurchases.date, since))).orderBy(desc(fuelPurchases.date));

  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is string => !!v))];
  const supplierRows = supplierIds.length ? await db.select({ _id: suppliers._id, name: suppliers.name }).from(suppliers).where(inArray(suppliers._id, supplierIds)) : [];
  const supplierById = new Map(supplierRows.map((s) => [s._id, s]));
  return rows.map((r) => ({ ...r, supplierId: r.supplierId ? supplierById.get(r.supplierId) ?? r.supplierId : r.supplierId }));
}

// Physical stock on hand per fuel type = everything actually weighed in,
// minus everything fed into a chamber so far — cumulative through the
// selected season (like reconciliation.service.ts's stock figures), so
// browsing an archived season shows stock as of that point in time.
export async function fuelStockBalance(kilnId: string, seasonId: string) {
  const seasonIds = await seasonIdsThrough(kilnId, seasonId);
  const [purchases, logs] = await Promise.all([
    db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), inArray(fuelPurchases.seasonId, seasonIds))),
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), inArray(fuelLogs.seasonId, seasonIds))),
  ]);

  const totals = new Map<string, number>();
  for (const p of purchases) {
    totals.set(p.fuelType, (totals.get(p.fuelType) ?? 0) + p.actualWeightKg);
  }
  for (const l of logs) {
    totals.set(l.fuelType, (totals.get(l.fuelType) ?? 0) - l.quantityKg);
  }
  return totals;
}

// Per-supplier payment/balance rollup — every real supplier (see
// createFuelPurchase's note on why this is `suppliers`, not `people`) who
// has at least one fuel purchase on record. due/paid are summed directly
// off each purchase row's own amount/paidAmount, same live-computed
// pattern getSupplierDetail uses for goods invoices — no ledger involved.
// Purchases are cumulative through the selected season, matching
// fuelStockBalance.
export async function supplierFuelBalances(kilnId: string, seasonId: string) {
  const seasonIds = await seasonIdsThrough(kilnId, seasonId);
  const purchases = await db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), inArray(fuelPurchases.seasonId, seasonIds), isNotNull(fuelPurchases.supplierId)));
  const supplierIds = Array.from(new Set(purchases.map((p) => p.supplierId!)));
  if (supplierIds.length === 0) return [];

  const supplierRows = await db.select().from(suppliers).where(and(inArray(suppliers._id, supplierIds), eq(suppliers.kilnId, kilnId)));

  const results = supplierRows.map((supplier) => {
    const supplierPurchases = purchases.filter((p) => p.supplierId === supplier._id);
    const due = Math.round(supplierPurchases.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    const paid = Math.round(supplierPurchases.reduce((sum, p) => sum + (p.paidAmount ?? 0), 0) * 100) / 100;
    return {
      supplier: { id: supplier._id, name: supplier.name, phone: supplier.phone ?? null },
      purchaseCount: supplierPurchases.length,
      totalWeightKg: supplierPurchases.reduce((sum, p) => sum + p.actualWeightKg, 0),
      totalDue: due,
      totalPaid: paid,
      balance: Math.round((due - paid) * 100) / 100,
    };
  });

  return results.sort((a, b) => b.balance - a.balance);
}

// All-time equivalent of supplierFuelBalances above (no season scoping —
// same "a debt doesn't reset at a season boundary" convention
// supplierInvoice.service.ts's listSupplierDuesAcrossKiln uses), positive
// balances only. Feeds person.service.ts's listPaymentsDue — see that
// function's own comment for why fuel-purchase-supplier debt needs to
// reach it at all.
export async function totalFuelPurchaseSupplierDues(kilnId: string) {
  const purchases = await db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), isNotNull(fuelPurchases.supplierId)));
  if (purchases.length === 0) return [];
  const supplierIds = Array.from(new Set(purchases.map((p) => p.supplierId!)));
  const supplierRows = await db.select().from(suppliers).where(and(inArray(suppliers._id, supplierIds), eq(suppliers.kilnId, kilnId)));

  return supplierRows
    .map((supplier) => {
      const supplierPurchases = purchases.filter((p) => p.supplierId === supplier._id);
      const due = supplierPurchases.reduce((sum, p) => sum + p.amount, 0);
      const paid = supplierPurchases.reduce((sum, p) => sum + (p.paidAmount ?? 0), 0);
      return { supplier: { id: supplier._id, name: supplier.name, phone: supplier.phone ?? null }, amountDue: Math.round((due - paid) * 100) / 100 };
    })
    .filter((r) => r.amountDue > 0);
}
