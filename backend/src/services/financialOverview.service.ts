import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { dispatches, expenses, fuelPurchases, vehicleDieselEntries, ledgerEntries, people } from "../db/schema";
import { listPaymentsDue, customerCreditAging } from "./person.service";

// Splits a set of money-flow rows into cash vs. online, for the Financial
// Overview's payment-method breakdown. CASH_AND_ONLINE rows split
// precisely using their own recorded cashAmount/onlineAmount; every other
// mode (BANK/UPI/GST_INVOICE) counts fully as "online"; CASH counts fully
// as "cash". A row with no paymentMode recorded at all (legacy data, or an
// optional field left blank) contributes to neither bucket — cash+online
// is a best-effort breakdown, `total` (computed elsewhere) stays the only
// number guaranteed to add up to everything.
function splitByPaymentMode<T extends { paymentMode?: string | null; cashAmount?: number | null; onlineAmount?: number | null }>(
  rows: T[],
  amountOf: (row: T) => number
) {
  let cash = 0;
  let online = 0;
  for (const row of rows) {
    if (row.paymentMode === "CASH_AND_ONLINE") {
      cash += row.cashAmount ?? 0;
      online += row.onlineAmount ?? 0;
    } else if (row.paymentMode === "CASH") {
      cash += amountOf(row);
    } else if (row.paymentMode) {
      online += amountOf(row);
    }
  }
  return { cash: Math.round(cash * 100) / 100, online: Math.round(online * 100) / 100 };
}

// One period's cash-flow snapshot: everything that actually moved, in one
// rupee-accountable place. "Money received" is real cash collected from
// customers (PAID ledger entries against CUSTOMER-type persons) — not
// revenue billed, which can sit uncollected as customer credit. "Money
// spent" sums every distinct spend source exactly once:
//   - Expense entries (JCB rental, royalty, petty cash, ...) — never touch
//     the ledger, so no overlap risk.
//   - FuelPurchase.amount (coal/wood/etc. bought) — the purchase's own
//     recorded cost, used directly rather than via the supplier's ledger,
//     since a fuel purchase only posts ledger entries when a supplier
//     person is linked; using `amount` here works whether or not one is.
//   - VehicleDieselEntry.costAmount (diesel bought for kiln vehicles) —
//     also never touches the ledger.
//   - Every other PAID ledger entry to a non-customer person (wages,
//     salaries, soil arrivals, advances/kharchi/medical/festival, ...)
//     EXCLUDING category "FUEL" — those are fuel-purchase-supplier
//     settlements already counted via FuelPurchase.amount above, so
//     including them again here would double-count the same rupees.
async function flowForRange(kilnId: string, since: Date, until?: Date) {
  const dateRange = (col: any) => (until ? and(gte(col, since), lte(col, until)) : gte(col, since));

  const [dispatchRows, expenseRows, fuelPurchaseRows, dieselRows, paidEntries, customers] = await Promise.all([
    db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), dateRange(dispatches.dispatchedOn))).all(),
    db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), dateRange(expenses.date))).all(),
    db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), dateRange(fuelPurchases.date))).all(),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), dateRange(vehicleDieselEntries.date))).all(),
    db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), dateRange(ledgerEntries.date), eq(ledgerEntries.direction, "PAID"))).all(),
    db.select({ _id: people._id }).from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "CUSTOMER"))).all(),
  ]);

  const customerIds = new Set(customers.map((c) => c._id));

  const customerPaidEntries = paidEntries.filter((e) => customerIds.has(e.personId));
  const moneyReceived = customerPaidEntries.reduce((sum, e) => sum + e.amount, 0);

  const expenseCosts = expenseRows.reduce((sum, e) => sum + e.amount, 0);
  const fuelCosts = fuelPurchaseRows.reduce((sum, p) => sum + p.amount, 0);
  const dieselCosts = dieselRows.reduce((sum, d) => sum + (d.costAmount ?? 0), 0);
  const otherPaymentEntries = paidEntries.filter((e) => !customerIds.has(e.personId) && e.category !== "FUEL");
  const otherPayments = otherPaymentEntries.reduce((sum, e) => sum + e.amount, 0);
  const moneySpent = expenseCosts + fuelCosts + dieselCosts + otherPayments;

  const bricksSold = dispatchRows.reduce((sum, d) => sum + d.bricksCount, 0);

  const moneyInSplit = splitByPaymentMode(customerPaidEntries, (e) => e.amount);
  const outSplits = [
    splitByPaymentMode(expenseRows, (e) => e.amount),
    splitByPaymentMode(fuelPurchaseRows, (p) => p.amount),
    splitByPaymentMode(dieselRows, (d) => d.costAmount ?? 0),
    splitByPaymentMode(otherPaymentEntries, (e) => e.amount),
  ];
  const moneyOutSplit = {
    cash: Math.round(outSplits.reduce((sum, s) => sum + s.cash, 0) * 100) / 100,
    online: Math.round(outSplits.reduce((sum, s) => sum + s.online, 0) * 100) / 100,
  };

  return {
    moneyReceived,
    moneySpent,
    netCashFlow: moneyReceived - moneySpent,
    bricksSold,
    fuelExpense: fuelCosts,
    dieselExpense: dieselCosts,
    breakdown: { expenses: expenseCosts, fuel: fuelCosts, diesel: dieselCosts, otherPayments },
    moneyIn: { cash: moneyInSplit.cash, online: moneyInSplit.online, total: moneyReceived },
    moneyOut: { cash: moneyOutSplit.cash, online: moneyOutSplit.online, total: moneySpent },
  };
}

// The "as of right now" balances — distinct from the flow figures above,
// since a balance isn't something that happened "this week," it's the
// running total as things stand today. dues = what the kiln currently
// owes others (labor/contractors/suppliers); outstandingFromClients =
// what customers currently owe the kiln. Reuses the exact same
// computations already surfacing on the Dashboard/People pages so this
// page can never disagree with those about who owes what.
async function currentPosition(kilnId: string) {
  const [dues, credit] = await Promise.all([listPaymentsDue(kilnId), customerCreditAging(kilnId)]);
  return {
    totalDues: Math.round(dues.reduce((sum, d) => sum + d.amountDue, 0) * 100) / 100,
    totalOutstandingFromClients: Math.round(credit.reduce((sum, c) => sum + c.outstandingCredit, 0) * 100) / 100,
  };
}

export async function financialOverview(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const [today, week, month, year, position] = await Promise.all([
    flowForRange(kilnId, startOfDay),
    flowForRange(kilnId, weekAgo),
    flowForRange(kilnId, monthAgo),
    flowForRange(kilnId, yearAgo),
    currentPosition(kilnId),
  ]);

  return { today, week, month, year, ...position };
}

export async function financialOverviewCustomRange(kilnId: string, from: Date, to: Date) {
  return flowForRange(kilnId, from, to);
}
