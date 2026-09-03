import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, expenses, ledgerEntries, people, ghers, fuelLogs, stackingEntries, fuelPurchases, vehicleDieselEntries, chamberGradings } from "../db/schema";
import type { BrickLineItem } from "../db/schema/_helpers";
import { totalGradedOutput } from "./chamberGrading.service";

// A simplified revenue-vs-cost snapshot, not a full accounting P&L
// (no depreciation, no partner-wise split, no accrual/cash distinction
// beyond what the ledger already captures) — but a genuine "did this
// period make money" answer, which is the question that actually gets
// asked. Labor/service costs come from every non-customer ledger DUE entry
// (wages/payments owed, accrual-style — matches when the cost was
// incurred, not necessarily when it was paid out).
export async function seasonFinancialSummary(kilnId: string, seasonId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Revenue sourced from invoices (amountPaidNow, falling back to
  // netAmount), the same formula and same COALESCE(invoiceDate, createdAt)
  // date basis financialOverview.service.ts's flowForRange uses for
  // "moneyReceived" — this used to sum dispatches.amount instead, which is
  // the accrual sale value the instant a dispatch is logged (no GST,
  // regardless of whether the customer has actually paid), so it could
  // silently disagree with Financial Overview for the same period. Using
  // the same source here keeps every "revenue"/"money received" figure in
  // the app in agreement.
  const [invoiceRows, expenseRows, dueEntries, customers, totalBricksProduced, fuelPurchaseRows, dieselRows] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.kilnId, kilnId), eq(invoices.seasonId, seasonId), sql`COALESCE(${invoices.invoiceDate}, ${invoices.createdAt}) >= ${since}`)),
    db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), eq(expenses.seasonId, seasonId), gte(expenses.date, since))),
    // ledgerEntries.seasonId is optional (not reliably populated — see
    // ledger.service.ts's AddLedgerEntryInput comment) and left unfiltered
    // here for that reason; the date-range bound already scopes this.
    db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), gte(ledgerEntries.date, since), eq(ledgerEntries.direction, "DUE"))),
    db.select({ _id: people._id }).from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "CUSTOMER"))),
    totalGradedOutput(kilnId, seasonId, since),
    db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), eq(fuelPurchases.seasonId, seasonId), gte(fuelPurchases.date, since))),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.seasonId, seasonId), gte(vehicleDieselEntries.date, since))),
  ]);

  const customerIds = new Set(customers.map((c) => c._id));
  const revenue = invoiceRows.reduce((sum, inv) => sum + (inv.amountPaidNow ?? inv.netAmount), 0);
  const expenseCosts = expenseRows.reduce((sum, e) => sum + e.amount, 0);
  const fuelCosts = fuelPurchaseRows.reduce((sum, p) => sum + p.amount, 0);
  const dieselCosts = dieselRows.reduce((sum, d) => sum + (d.costAmount ?? 0), 0);
  // A FuelPurchase with a linked supplier also posts its own "FUEL"-category
  // DUE ledger entry (fuelPurchase.service.ts's createFuelPurchase) — same
  // double-count risk financialOverview.service.ts's flowForRange already
  // guards against, and the same fix: exclude category FUEL here since
  // fuelPurchaseRows above already counts that cost directly.
  const laborCosts = dueEntries
    .filter((e) => !customerIds.has(e.personId) && e.category !== "FUEL")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalCosts = expenseCosts + laborCosts + fuelCosts + dieselCosts;

  return {
    days,
    revenue,
    expenseCosts,
    laborCosts,
    fuelCosts,
    dieselCosts,
    totalCosts,
    netProfit: revenue - totalCosts,
    // Every expense/labor cost for the period, spread across every brick
    // graded out of a chamber in that same window — a kiln-wide average,
    // not attributable to any one batch (see chamberCostReport for the
    // directly-attributable, one-chamber version of this same idea).
    totalBricksProduced,
    costPerBrick: totalBricksProduced > 0 ? Math.round((totalCosts / totalBricksProduced) * 100) / 100 : null,
  };
}

// Directly-attributable cost for one chamber's current/most-recent firing
// cycle: fuel fed into that specific Gher (priced at this kiln's own
// average ₹/kg per fuel type, from FuelPurchase) plus the stacking wages
// paid for that chamber. Deliberately doesn't try to allocate a share of
// molding/soil cost across chambers — that attribution gets arbitrary fast
// without a much bigger cost-accounting model, so it's left out rather
// than guessed at. Divided by that same cycle's own graded output (once
// graded) for a real, directly-attributable ₹/brick figure — null while
// the chamber hasn't been graded yet this cycle, rather than guessed at
// from bricks merely loaded (which haven't survived firing yet).
export async function chamberCostReport(kilnId: string, seasonId: string, gherId: string) {
  const gher = (await db.select().from(ghers).where(and(eq(ghers._id, gherId), eq(ghers.kilnId, kilnId))))[0];
  if (!gher) throw new Error("Referenced chamber not found in this kiln");

  const since = gher.cycleStartedAt ?? new Date(0);

  const [fuelLogRows, stackingEntryRows, fuelPurchaseRows, gradingRows] = await Promise.all([
    db.select().from(fuelLogs).where(and(eq(fuelLogs.kilnId, kilnId), eq(fuelLogs.seasonId, seasonId), eq(fuelLogs.gherId, gherId), gte(fuelLogs.date, since))),
    db.select().from(stackingEntries).where(and(eq(stackingEntries.kilnId, kilnId), eq(stackingEntries.seasonId, seasonId), eq(stackingEntries.gherId, gherId), gte(stackingEntries.date, since))),
    // fuelPurchases stays kiln-wide/unfiltered — this is only used to
    // derive an average ₹/kg per fuel type (fuelStockBalance's own
    // cumulative treatment), not this chamber's own activity.
    db.select().from(fuelPurchases).where(eq(fuelPurchases.kilnId, kilnId)),
    db.select().from(chamberGradings).where(and(eq(chamberGradings.kilnId, kilnId), eq(chamberGradings.seasonId, seasonId), eq(chamberGradings.gherId, gherId), gte(chamberGradings.date, since))),
  ]);

  const fuelTotals = new Map<string, { amount: number; weight: number }>();
  for (const p of fuelPurchaseRows) {
    const t = fuelTotals.get(p.fuelType) ?? { amount: 0, weight: 0 };
    t.amount += p.amount;
    t.weight += p.actualWeightKg;
    fuelTotals.set(p.fuelType, t);
  }

  const fuelCost = fuelLogRows.reduce((sum, log) => {
    const t = fuelTotals.get(log.fuelType);
    const costPerKg = t && t.weight > 0 ? t.amount / t.weight : 0;
    return sum + log.quantityKg * costPerKg;
  }, 0);

  // Bharai moved to a monthly salary (see stacking.service.ts) that isn't
  // attributable to a single chamber, so only entries still carrying a
  // historical piece-rate (ratePerThousand, pre-dating that change)
  // contribute here — new entries add 0, same as fuel would if unlogged.
  const stackingCost = stackingEntryRows.reduce(
    (sum, s) => sum + (s.bricksCount / 1000) * (s.ratePerThousand ?? 0),
    0
  );

  const totalCost = fuelCost + stackingCost;
  const bricksProduced = gradingRows.reduce((sum, g) => {
    const items = (g.items as BrickLineItem[] | null) ?? [];
    return sum + (items.length > 0 ? items.reduce((s, i) => s + i.bricksCount, 0) : g.a1Count + g.jhamaCount + g.pelaCount + g.rodaCount);
  }, 0);

  return {
    gherNumber: gher.number,
    fuelCost: Math.round(fuelCost),
    stackingCost: Math.round(stackingCost),
    totalCost: Math.round(totalCost),
    bricksProduced,
    costPerBrick: bricksProduced > 0 ? Math.round((totalCost / bricksProduced) * 100) / 100 : null,
  };
}
