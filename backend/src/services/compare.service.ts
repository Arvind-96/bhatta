import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "../db/client";
import {
  moldingEntries,
  nikasiEntries,
  firingShifts,
  brickProductionEntries,
  stockLoadingEntries,
  brickLoadingEntries,
  vehicleDieselEntries,
  fuelPurchases,
  expenses,
  attendances,
  salarySlips,
  soilTrips,
  ledgerEntries,
  people,
} from "../db/schema";
import { totalMolded } from "./molding.service";
import { totalStacked } from "./stacking.service";
import { totalA1Output } from "./chamberGrading.service";
import { dispatchTotalsForRange } from "./dispatch.service";
import { financialOverviewCustomRange } from "./financialOverview.service";
import { monthStringsInRange } from "../utils/season";

export const COMPARE_MODULES = [
  "financial", "bricks", "molding", "stacking", "nikasi", "firing", "brickLoading",
  "dispatch", "soil", "diesel", "fuel", "expense", "stock", "attendance", "salary", "labor",
] as const;
export type CompareModule = (typeof COMPARE_MODULES)[number];

async function compareBricks(kilnId: string, from: Date, to: Date) {
  const [molded, stacked, a1Output, dispatched] = await Promise.all([
    totalMolded(kilnId, from, to),
    totalStacked(kilnId, from, to),
    totalA1Output(kilnId, from, to),
    dispatchTotalsForRange(kilnId, from, to),
  ]);
  return {
    bricksMolded: molded,
    bricksStacked: stacked.bricksCount,
    stackingDamage: stacked.damageCount,
    a1Graded: a1Output,
    bricksDispatched: dispatched.bricksCount,
    dispatchRevenue: dispatched.amount,
    dispatchCount: dispatched.dispatchCount,
  };
}

async function compareMolding(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, from), lte(moldingEntries.date, to))).all();
  return {
    bricksMolded: rows.filter((e) => !e.washedOut).reduce((sum, e) => sum + e.bricksCount, 0),
    damagedCount: rows.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0),
    washedOutEntries: rows.filter((e) => e.washedOut).length,
    entryCount: rows.length,
  };
}

async function compareStacking(kilnId: string, from: Date, to: Date) {
  const result = await totalStacked(kilnId, from, to);
  return { bricksStacked: result.bricksCount, damageCount: result.damageCount };
}

async function compareNikasi(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), gte(nikasiEntries.date, from), lte(nikasiEntries.date, to))).all();
  return {
    bricksUnloaded: rows.reduce((sum, e) => sum + e.bricksCount, 0),
    damagedCount: rows.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0),
    tripCount: rows.length,
  };
}

async function compareFiring(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(firingShifts).where(and(eq(firingShifts.kilnId, kilnId), gte(firingShifts.date, from), lte(firingShifts.date, to))).all();
  return {
    shiftCount: rows.length,
    totalOvertimeHours: rows.reduce((sum, s) => sum + (s.overtimeHours ?? 0), 0),
    totalBonusAmount: rows.reduce((sum, s) => sum + (s.bonusAmount ?? 0), 0),
  };
}

async function compareBrickLoading(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries.kilnId, kilnId), gte(brickLoadingEntries.date, from), lte(brickLoadingEntries.date, to))).all();
  return {
    bricksLoaded: rows.reduce((sum, e) => sum + e.bricksCount, 0),
    totalTips: rows.reduce((sum, e) => sum + (e.tipAmount ?? 0), 0),
    tripCount: rows.length,
  };
}

async function compareSoil(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), gte(soilTrips.date, from), lte(soilTrips.date, to))).all();
  return {
    trolleyCount: rows.reduce((sum, t) => sum + (t.trolleyCount ?? 0), 0),
    tripCount: rows.length,
    totalCost: rows.reduce((sum, t) => sum + (t.trolleyCount ?? 0) * t.ratePerTrolley, 0),
  };
}

async function compareDiesel(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), gte(vehicleDieselEntries.date, from), lte(vehicleDieselEntries.date, to))).all();
  return {
    quantityLiters: rows.reduce((sum, e) => sum + e.quantityLiters, 0),
    totalCost: rows.reduce((sum, e) => sum + (e.costAmount ?? 0), 0),
    entryCount: rows.length,
  };
}

async function compareFuel(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), gte(fuelPurchases.date, from), lte(fuelPurchases.date, to))).all();
  return {
    totalWeightKg: rows.reduce((sum, r) => sum + r.actualWeightKg, 0),
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
    purchaseCount: rows.length,
  };
}

async function compareExpense(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), gte(expenses.date, from), lte(expenses.date, to))).all();
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
  return {
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
    entryCount: rows.length,
    byCategory: Object.fromEntries(byCategory),
  };
}

// "Stock movement" — production added vs. loading (dispatched-out)
// removed, the two flows that change finished-goods stock day to day.
async function compareStock(kilnId: string, from: Date, to: Date) {
  const [produced, loadedOut] = await Promise.all([
    db.select().from(brickProductionEntries).where(and(eq(brickProductionEntries.kilnId, kilnId), gte(brickProductionEntries.date, from), lte(brickProductionEntries.date, to))).all(),
    db.select().from(stockLoadingEntries).where(and(eq(stockLoadingEntries.kilnId, kilnId), gte(stockLoadingEntries.date, from), lte(stockLoadingEntries.date, to))).all(),
  ]);
  const bricksProduced = produced.reduce((sum, e) => sum + e.bricksCount, 0);
  const bricksLoadedOut = loadedOut.reduce((sum, e) => sum + e.bricksCount, 0);
  return { bricksProduced, bricksLoadedOut, netChange: bricksProduced - bricksLoadedOut };
}

async function compareAttendance(kilnId: string, from: Date, to: Date) {
  const rows = await db.select().from(attendances).where(and(eq(attendances.kilnId, kilnId), gte(attendances.date, from), lte(attendances.date, to))).all();
  return {
    daysAbsent: rows.filter((r) => r.status === "ABSENT").length,
    daysHalfDay: rows.filter((r) => r.status === "HALF_DAY").length,
    daysLate: rows.filter((r) => r.status === "LATE").length,
    exceptionRowCount: rows.length,
  };
}

async function compareSalary(kilnId: string, from: Date, to: Date) {
  const months = monthStringsInRange(from, to);
  const rows = await db.select().from(salarySlips).where(and(eq(salarySlips.kilnId, kilnId), inArray(salarySlips.month, months))).all();
  return {
    totalGrossSalary: rows.reduce((sum, s) => sum + s.grossSalary, 0),
    totalDeductions: rows.reduce((sum, s) => sum + s.deductions, 0),
    totalNetSalary: rows.reduce((sum, s) => sum + s.netSalary, 0),
    slipCount: rows.length,
  };
}

// "Labor accounts" — every person except customers (same population
// listPaymentsDue already uses for Total Dues), summed by ledger
// direction within the season window. ledgerEntries has no kiln-wide
// date-scoped rollup anywhere else in the app, so this is genuinely new.
async function compareLabor(kilnId: string, from: Date, to: Date) {
  const nonCustomerIds = await db.select({ _id: people._id }).from(people).where(and(eq(people.kilnId, kilnId), ne(people.type, "CUSTOMER"))).all();
  const ids = nonCustomerIds.map((p) => p._id);
  if (ids.length === 0) {
    return { totalWagesDue: 0, totalPaidOut: 0, netOutstandingChange: 0, activePersonCount: 0 };
  }
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), inArray(ledgerEntries.personId, ids), gte(ledgerEntries.date, from), lte(ledgerEntries.date, to)))
    .all();
  const totalWagesDue = rows.filter((r) => r.direction === "DUE").reduce((sum, r) => sum + r.amount, 0);
  const totalPaidOut = rows.filter((r) => r.direction === "PAID").reduce((sum, r) => sum + r.amount, 0);
  return {
    totalWagesDue,
    totalPaidOut,
    netOutstandingChange: Math.round((totalWagesDue - totalPaidOut) * 100) / 100,
    activePersonCount: new Set(rows.map((r) => r.personId)).size,
  };
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface RangeResult {
  from: string;
  to: string;
  inProgress: boolean;
  metrics: Record<string, number | Record<string, number>>;
}

// One entry point for every module — takes two admin-picked date ranges
// (Compare's calendar pickers, no longer tied to fixed Aug1-Jul31 season
// boundaries) and dispatches each to whichever module aggregator applies.
// Financial reuses financialOverviewCustomRange as-is (already
// arbitrary-range); everything else is either an in-place-extended
// existing "since" function or a small new range query following that
// module's own existing simple query shape.
export async function compareModule(kilnId: string, module: CompareModule, ranges: DateRange[]) {
  const now = new Date();
  const results: RangeResult[] = [];

  for (const { from, to } of ranges) {
    const inProgress = to > now;
    // Never query past "now" for an in-progress range — a raw `to` in the
    // future would just behave the same for these <= comparisons, but
    // clamping keeps intent explicit for the "in progress" badge.
    const effectiveTo = inProgress ? now : to;

    let metrics: Record<string, number | Record<string, number>>;
    switch (module) {
      case "financial": {
        const flow = await financialOverviewCustomRange(kilnId, from, effectiveTo);
        metrics = {
          moneyReceived: flow.moneyReceived,
          moneySpent: flow.moneySpent,
          netCashFlow: flow.netCashFlow,
          bricksSold: flow.bricksSold,
          fuelExpense: flow.fuelExpense,
          dieselExpense: flow.dieselExpense,
        };
        break;
      }
      case "bricks":
        metrics = await compareBricks(kilnId, from, effectiveTo);
        break;
      case "molding":
        metrics = await compareMolding(kilnId, from, effectiveTo);
        break;
      case "stacking":
        metrics = await compareStacking(kilnId, from, effectiveTo);
        break;
      case "nikasi":
        metrics = await compareNikasi(kilnId, from, effectiveTo);
        break;
      case "firing":
        metrics = await compareFiring(kilnId, from, effectiveTo);
        break;
      case "brickLoading":
        metrics = await compareBrickLoading(kilnId, from, effectiveTo);
        break;
      case "dispatch":
        metrics = await dispatchTotalsForRange(kilnId, from, effectiveTo);
        break;
      case "soil":
        metrics = await compareSoil(kilnId, from, effectiveTo);
        break;
      case "diesel":
        metrics = await compareDiesel(kilnId, from, effectiveTo);
        break;
      case "fuel":
        metrics = await compareFuel(kilnId, from, effectiveTo);
        break;
      case "expense":
        metrics = await compareExpense(kilnId, from, effectiveTo);
        break;
      case "stock":
        metrics = await compareStock(kilnId, from, effectiveTo);
        break;
      case "attendance":
        metrics = await compareAttendance(kilnId, from, effectiveTo);
        break;
      case "salary":
        metrics = await compareSalary(kilnId, from, effectiveTo);
        break;
      case "labor":
        metrics = await compareLabor(kilnId, from, effectiveTo);
        break;
      default: {
        const _exhaustive: never = module;
        throw new Error(`Unknown compare module: ${_exhaustive}`);
      }
    }

    results.push({ from: from.toISOString(), to: to.toISOString(), inProgress, metrics });
  }

  return results;
}
