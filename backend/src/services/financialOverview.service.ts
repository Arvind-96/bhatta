import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { dispatches, expenses, fuelPurchases, vehicleDieselEntries, ledgerEntries, invoices } from "../db/schema";
import { listPaymentsDue, customerCreditAging } from "./person.service";

// Splits a set of money-flow rows into cash vs. online, for the Financial
// Overview's payment-method breakdown. CASH_AND_ONLINE rows split
// proportionally to their own recorded cashAmount:onlineAmount ratio,
// scaled to `amountOf(row)` rather than trusting the recorded amounts
// outright — an invoice's cashAmount/onlineAmount are entered against its
// full netAmount at creation time, but amountOf(row) (amountPaidNow) can be
// less on a partially-paid invoice, so scaling keeps cash+online exactly
// equal to what this row actually contributes to the period's total
// instead of overcounting by the still-due remainder. Every other mode
// (BANK/UPI/GST_INVOICE) counts fully as "online"; CASH counts fully as
// "cash". A row with no paymentMode recorded at all (legacy data, or an
// optional field left blank) contributes to neither bucket, surfacing
// instead as `unspecified` — cash+online+unspecified always equals `total`
// exactly (up to paise-level rounding), so the breakdown never silently
// falls short of the total shown elsewhere.
function splitByPaymentMode<T extends { paymentMode?: string | null; cashAmount?: number | null; onlineAmount?: number | null }>(
  rows: T[],
  amountOf: (row: T) => number
) {
  let cash = 0;
  let online = 0;
  let total = 0;
  for (const row of rows) {
    const amount = amountOf(row);
    total += amount;
    if (row.paymentMode === "CASH_AND_ONLINE") {
      const recordedCash = row.cashAmount ?? 0;
      const recordedOnline = row.onlineAmount ?? 0;
      const recordedTotal = recordedCash + recordedOnline;
      if (recordedTotal > 0) {
        cash += (recordedCash / recordedTotal) * amount;
        online += (recordedOnline / recordedTotal) * amount;
      }
    } else if (row.paymentMode === "CASH") {
      cash += amount;
    } else if (row.paymentMode) {
      online += amount;
    }
  }
  const roundedCash = Math.round(cash * 100) / 100;
  const roundedOnline = Math.round(online * 100) / 100;
  const roundedTotal = Math.round(total * 100) / 100;
  const unspecified = Math.round((roundedTotal - roundedCash - roundedOnline) * 100) / 100;
  return { cash: roundedCash, online: roundedOnline, unspecified };
}

// One period's cash-flow snapshot: everything that actually moved, in one
// rupee-accountable place. "Money received" is real money collected from
// customers — sourced from `invoices.amountPaidNow` (falling back to
// `netAmount`, same "unset = fully paid" convention getCustomerDetail
// uses), NOT ledger entries against a `people.type = "CUSTOMER"` row. That
// legacy person type predates the dedicated Customer/Dispatch/Invoice
// model this app actually bills through and is essentially never
// populated by real sales — summing it here silently reported ~0 "money
// received" regardless of actual sales. "Money spent" sums every distinct
// spend source exactly once:
//   - Expense entries (JCB rental, royalty, petty cash, ...) — never touch
//     the ledger, so no overlap risk.
//   - FuelPurchase.amount (coal/wood/etc. bought) — the purchase's own
//     recorded cost, used directly rather than via the supplier's ledger,
//     since a fuel purchase only posts ledger entries when a supplier
//     person is linked; using `amount` here works whether or not one is.
//   - VehicleDieselEntry.costAmount (diesel bought for kiln vehicles) —
//     also never touches the ledger.
//   - Every other PAID ledger entry (wages, salaries, soil arrivals,
//     advances/kharchi/medical/festival, ...) EXCLUDING category "FUEL" —
//     those are fuel-purchase-supplier settlements already counted via
//     FuelPurchase.amount above, so including them again here would
//     double-count the same rupees. Real customer payments never post to
//     ledgerEntries at all (see above), so no customer-exclusion filter is
//     needed here any more either.
// seasonId is nullable — pass null for an all-time, every-season view
// (Compare needs to see across a season boundary to compare two
// admin-picked date ranges at all, so it never passes a single season).
async function flowForRange(kilnId: string, seasonId: string | null, since: Date, until?: Date) {
  const dateRange = (col: any) => (until ? and(gte(col, since), lte(col, until)) : gte(col, since));
  // invoiceDate is nullable on older rows — fall back to createdAt so a
  // legacy invoice with no explicit date still lands in the right period
  // instead of being silently dropped from every date-ranged total. Built
  // as one raw predicate (rather than passing a sql`` fragment into
  // gte/lte) since there's no precedent elsewhere in this codebase for
  // drizzle's comparison helpers accepting a non-column left-hand side.
  const invoiceDateRange = until
    ? sql`COALESCE(${invoices.invoiceDate}, ${invoices.createdAt}) BETWEEN ${since} AND ${until}`
    : sql`COALESCE(${invoices.invoiceDate}, ${invoices.createdAt}) >= ${since}`;

  const [dispatchRows, expenseRows, fuelPurchaseRows, dieselRows, paidEntries, invoiceRows] = await Promise.all([
    db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), seasonId ? eq(dispatches.seasonId, seasonId) : undefined, dateRange(dispatches.dispatchedOn))),
    db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), seasonId ? eq(expenses.seasonId, seasonId) : undefined, dateRange(expenses.date))),
    db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), seasonId ? eq(fuelPurchases.seasonId, seasonId) : undefined, dateRange(fuelPurchases.date))),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), seasonId ? eq(vehicleDieselEntries.seasonId, seasonId) : undefined, dateRange(vehicleDieselEntries.date))),
    // ledgerEntries.seasonId is optional (not reliably populated — see
    // ledger.service.ts's AddLedgerEntryInput comment) and left unfiltered
    // here regardless of seasonId; the date-range bound already scopes this
    // to the requested window.
    db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), dateRange(ledgerEntries.date), eq(ledgerEntries.direction, "PAID"))),
    db.select().from(invoices).where(and(eq(invoices.kilnId, kilnId), seasonId ? eq(invoices.seasonId, seasonId) : undefined, invoiceDateRange)),
  ]);

  const moneyReceived = invoiceRows.reduce((sum, inv) => sum + (inv.amountPaidNow ?? inv.netAmount), 0);

  const expenseCosts = expenseRows.reduce((sum, e) => sum + e.amount, 0);
  const fuelCosts = fuelPurchaseRows.reduce((sum, p) => sum + p.amount, 0);
  const dieselCosts = dieselRows.reduce((sum, d) => sum + (d.costAmount ?? 0), 0);
  const otherPaymentEntries = paidEntries.filter((e) => e.category !== "FUEL");
  const otherPayments = otherPaymentEntries.reduce((sum, e) => sum + e.amount, 0);
  const moneySpent = expenseCosts + fuelCosts + dieselCosts + otherPayments;

  const bricksSold = dispatchRows.reduce((sum, d) => sum + d.bricksCount, 0);

  const moneyInSplit = splitByPaymentMode(invoiceRows, (inv) => inv.amountPaidNow ?? inv.netAmount);
  const outSplits = [
    splitByPaymentMode(expenseRows, (e) => e.amount),
    splitByPaymentMode(fuelPurchaseRows, (p) => p.amount),
    splitByPaymentMode(dieselRows, (d) => d.costAmount ?? 0),
    splitByPaymentMode(otherPaymentEntries, (e) => e.amount),
  ];
  const moneyOutSplit = {
    cash: Math.round(outSplits.reduce((sum, s) => sum + s.cash, 0) * 100) / 100,
    online: Math.round(outSplits.reduce((sum, s) => sum + s.online, 0) * 100) / 100,
    unspecified: Math.round(outSplits.reduce((sum, s) => sum + s.unspecified, 0) * 100) / 100,
  };

  return {
    moneyReceived,
    moneySpent,
    netCashFlow: moneyReceived - moneySpent,
    bricksSold,
    fuelExpense: fuelCosts,
    dieselExpense: dieselCosts,
    breakdown: { expenses: expenseCosts, fuel: fuelCosts, diesel: dieselCosts, otherPayments },
    moneyIn: { cash: moneyInSplit.cash, online: moneyInSplit.online, unspecified: moneyInSplit.unspecified, total: moneyReceived },
    moneyOut: { cash: moneyOutSplit.cash, online: moneyOutSplit.online, unspecified: moneyOutSplit.unspecified, total: moneySpent },
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

// This kiln operates in India (IST, UTC+5:30) but the VPS/Node process may
// run in any timezone (currently UTC) — using `new Date(); setHours(...)`
// would silently compute the day/period boundary in whatever timezone the
// SERVER happens to be in, not the business's own calendar day. IST is 5.5
// hours ahead of UTC, so entries logged just after IST midnight (already
// "today" to the admin) can still carry yesterday's UTC date — this
// converts "now" to its IST wall-clock date/time first, zeroes the
// time-of-day there, then converts that IST midnight back to the real UTC
// instant it corresponds to, so the boundary always matches the business's
// actual calendar day regardless of server timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istStartOfDay(date: Date): Date {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  istNow.setUTCHours(0, 0, 0, 0);
  return new Date(istNow.getTime() - IST_OFFSET_MS);
}

export async function financialOverview(kilnId: string, seasonId: string) {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const startOfDay = istStartOfDay(now);
  const weekAgo = istStartOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const monthAgo = istStartOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const yearAgo = istStartOfDay(oneYearAgo);

  const [today, week, month, year, position] = await Promise.all([
    flowForRange(kilnId, seasonId, startOfDay),
    flowForRange(kilnId, seasonId, weekAgo),
    flowForRange(kilnId, seasonId, monthAgo),
    flowForRange(kilnId, seasonId, yearAgo),
    currentPosition(kilnId),
  ]);

  return { today, week, month, year, ...position };
}

export async function financialOverviewCustomRange(kilnId: string, seasonId: string | null, from: Date, to: Date) {
  return flowForRange(kilnId, seasonId, from, to);
}
