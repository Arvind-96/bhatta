import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { fuelPurchases, fuelLogs, people } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { assertFuelTypeExists } from "./fuelType.service";
import { addLedgerEntry, listLedgerForPerson } from "./ledger.service";
import { emitToKiln } from "../config/socket";

const WEIGHT_VARIANCE_ALERT_THRESHOLD = 0.03; // 3%

export interface CreateFuelPurchaseInput {
  kilnId: string;
  fuelType: string;
  supplierId?: string;
  vehicleNumber?: string;
  invoicedWeightKg: number;
  actualWeightKg: number;
  amount: number;
  paidAmount?: number;
  date?: Date;
  notes?: string;
}

// Weighed in, and (if a supplier is on record) posted straight to their
// ledger — a DUE for the full invoice amount and a PAID for whatever was
// handed over right away, same pair-of-entries pattern
// soilArrival.service.ts uses for landowners. "Pending balance due" is
// never stored here; it's just that supplier's live ledger balance.
export async function createFuelPurchase(input: CreateFuelPurchaseInput) {
  await assertFuelTypeExists(input.kilnId, input.fuelType);
  if (input.supplierId) {
    await assertPersonOfType(input.kilnId, input.supplierId, ["SUPPLIER"]);
  }

  const _id = randomUUID();
  db.insert(fuelPurchases).values({ ...input, _id }).run();
  const purchase = db.select().from(fuelPurchases).where(eq(fuelPurchases._id, _id)).get()!;

  if (input.supplierId && input.amount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.supplierId,
      direction: "DUE",
      amount: input.amount,
      reason: `Fuel purchase: ${input.fuelType} (${input.actualWeightKg.toLocaleString()} kg)`,
      date: input.date,
      category: "FUEL",
    });
    if (input.paidAmount && input.paidAmount > 0) {
      await addLedgerEntry({
        kilnId: input.kilnId,
        personId: input.supplierId,
        direction: "PAID",
        amount: input.paidAmount,
        reason: "Payment given for fuel purchase",
        date: input.date,
        category: "FUEL",
      });
    }
  }

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

export async function listFuelPurchases(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), gte(fuelPurchases.date, since))).orderBy(desc(fuelPurchases.date)).all();

  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is string => !!v))];
  const supplierRows = supplierIds.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, supplierIds)).all() : [];
  const supplierById = new Map(supplierRows.map((s) => [s._id, s]));
  return rows.map((r) => ({ ...r, supplierId: r.supplierId ? supplierById.get(r.supplierId) ?? r.supplierId : r.supplierId }));
}

// Physical stock on hand per fuel type = everything actually weighed in,
// minus everything fed into a chamber so far.
export async function fuelStockBalance(kilnId: string) {
  const [purchases, logs] = await Promise.all([
    db.select().from(fuelPurchases).where(eq(fuelPurchases.kilnId, kilnId)).all(),
    db.select().from(fuelLogs).where(eq(fuelLogs.kilnId, kilnId)).all(),
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

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// Per-supplier payment/balance rollup — every SUPPLIER who has at least one
// fuel purchase on record, their combined fuel-purchase ledger (category
// FUEL only, so a supplier who also sells soil or something else doesn't
// have that mixed in here).
export async function supplierFuelBalances(kilnId: string) {
  const purchases = await db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), isNotNull(fuelPurchases.supplierId))).all();
  const supplierIds = Array.from(new Set(purchases.map((p) => p.supplierId!)));
  if (supplierIds.length === 0) return [];

  const suppliers = await db.select().from(people).where(and(inArray(people._id, supplierIds), eq(people.kilnId, kilnId))).all();

  const results = await Promise.all(
    suppliers.map(async (supplier) => {
      const ledger = await listLedgerForPerson(kilnId, supplier._id);
      const fuelLedger = ledger.filter((e) => e.category === "FUEL");
      const { due, paid, balance } = sumByDirection(fuelLedger);
      const supplierPurchases = purchases.filter((p) => p.supplierId === supplier._id);
      return {
        supplier: { id: supplier._id, name: supplier.name, phone: supplier.phone ?? null },
        purchaseCount: supplierPurchases.length,
        totalWeightKg: supplierPurchases.reduce((sum, p) => sum + p.actualWeightKg, 0),
        totalDue: due,
        totalPaid: paid,
        balance,
      };
    })
  );

  return results.sort((a, b) => b.balance - a.balance);
}
