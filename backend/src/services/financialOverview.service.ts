import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { dispatches, expenses, fuelPurchases, vehicleDieselEntries, ledgerEntries, invoices } from "../db/schema";
import { listPaymentsDue, customerCreditAging } from "./person.service";
import { istStartOfDay, istDateOnly } from "../utils/istTime";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

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
// uses) PLUS every Dispatch that was never turned into a formal Invoice
// (see unInvoicedDispatches below) — NOT ledger entries against a
// `people.type = "CUSTOMER"` row. That legacy person type predates the
// dedicated Customer/Dispatch/Invoice model this app actually bills
// through and is essentially never populated by real sales — summing it
// here silently reported ~0 "money received" regardless of actual sales.
// Counting invoices ALONE (the original version of this function) has the
// same silent-undercount problem in a subtler way: a Dispatch is a
// complete, real sale the moment it's logged (it now carries its own
// paymentMode/cashAmount/onlineAmount — see dispatch.service.ts), but
// "Invoice" is a separate, optional follow-up step (the printed GST
// document) an admin can forget or simply not get around to for days —
// during which that entire sale was invisible here while showing up fine
// on the Reports page's dispatch-based totals, exactly the kind of
// cross-page mismatch a client would notice immediately.
//
// "Money spent" sums every distinct spend source exactly once:
//   - Expense entries (JCB rental, royalty, petty cash, ...) — never touch
//     the ledger, so no overlap risk.
//   - FuelPurchase.paidAmount (coal/wood/etc. bought) — what's actually
//     been paid to the supplier so far, NOT the full bill (fuelPurchases.
//     amount) — a fuel purchase can be partially paid on credit exactly
//     like a Supplier Invoice, and the unpaid remainder already shows up
//     separately as a supplier due (person.service.ts's listPaymentsDue).
//     FuelPurchase never posts ledger entries (a supplier lives in the
//     dedicated `suppliers` table, not `people`, so there's no valid
//     ledger link even when one is attached), so this is the only place
//     this cost is counted — no double-count risk either way.
//   - VehicleDieselEntry.costAmount (diesel bought for kiln vehicles) —
//     also never touches the ledger.
//   - Every other PAID ledger entry (wages, salaries, soil arrivals,
//     advances/kharchi/medical/festival, ...) — real customer payments
//     never post to ledgerEntries at all (see above), so no customer-
//     exclusion filter is needed here.
// seasonId is nullable — pass null for an all-time, every-season view
// (Compare needs to see across a season boundary to compare two
// admin-picked date ranges at all, so it never passes a single season).
export async function flowForRange(kilnId: string, seasonId: string | null, since: Date, until?: Date) {
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

  const [dispatchRows, expenseRows, fuelPurchaseRows, dieselRows, paidEntries, invoiceRows, invoicedDispatchIdRows] = await Promise.all([
    db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), eq(dispatches.cancelled, false), seasonId ? eq(dispatches.seasonId, seasonId) : undefined, dateRange(dispatches.dispatchedOn))),
    db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), seasonId ? eq(expenses.seasonId, seasonId) : undefined, dateRange(expenses.date))),
    db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), seasonId ? eq(fuelPurchases.seasonId, seasonId) : undefined, dateRange(fuelPurchases.date))),
    db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), seasonId ? eq(vehicleDieselEntries.seasonId, seasonId) : undefined, dateRange(vehicleDieselEntries.date))),
    // ledgerEntries.seasonId is optional (not reliably populated — see
    // ledger.service.ts's AddLedgerEntryInput comment) and left unfiltered
    // here regardless of seasonId; the date-range bound already scopes this
    // to the requested window. isReversal=false excludes a PAID entry
    // posted purely to zero out a cancelled/reattributed/corrected-down
    // liability (see ledgerEntries.isReversal's schema comment) — no real
    // cash moved for one of those, so counting it here would inflate
    // "money spent" for money the kiln never actually paid out.
    db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), dateRange(ledgerEntries.date), eq(ledgerEntries.direction, "PAID"), eq(ledgerEntries.isReversal, false))),
    db.select().from(invoices).where(and(eq(invoices.kilnId, kilnId), eq(invoices.cancelled, false), seasonId ? eq(invoices.seasonId, seasonId) : undefined, invoiceDateRange)),
    // Kiln-wide, NOT date-ranged — this only answers "does this dispatch
    // have an invoice at all, ever", so a dispatch logged inside the period
    // whose invoice happened to be created just outside it (or vice versa)
    // is still correctly recognized as invoiced, instead of getting
    // double-counted (once via invoiceRows, once via unInvoicedDispatches).
    // Cancelled invoices excluded — a dispatch whose only invoice was
    // cancelled goes back to being "un-invoiced", same as a deleted one.
    db.select({ dispatchId: invoices.dispatchId }).from(invoices).where(and(eq(invoices.kilnId, kilnId), eq(invoices.cancelled, false), isNotNull(invoices.dispatchId))),
  ]);

  const invoicedDispatchIds = new Set(invoicedDispatchIdRows.map((r) => r.dispatchId));
  // A Dispatch nobody has generated a formal Invoice for yet is still a
  // real, complete sale — see this function's own doc comment above for
  // why counting invoices alone silently dropped it from "money received".
  const unInvoicedDispatches = dispatchRows.filter((d) => !invoicedDispatchIds.has(d._id));

  const moneyReceived = round2(
    invoiceRows.reduce((sum, inv) => sum + (inv.amountPaidNow ?? inv.netAmount), 0) +
      unInvoicedDispatches.reduce((sum, d) => sum + d.amount, 0)
  );

  const expenseCosts = expenseRows.reduce((sum, e) => sum + e.amount, 0);
  // Bug fix: this used to sum p.amount — the full bill FuelPurchase records
  // against the supplier — not what was actually paid. fuelPurchases.amount
  // and .paidAmount are deliberately separate columns (see
  // fuelPurchase.service.ts's createFuelPurchase: "due = amount -
  // paidAmount, computed live off the row itself", the exact same pattern
  // Supplier Invoices use), so a partially- or un-paid fuel purchase was
  // inflating "money spent" by however much of the bill hasn't actually
  // been paid to the supplier yet — cash that hasn't left the business.
  // The unpaid remainder already correctly shows up separately as a
  // supplier due (see person.service.ts's listPaymentsDue /
  // totalFuelPurchaseSupplierDues) — nothing is lost by excluding it here,
  // it just now counts in the right place instead of both.
  const fuelCosts = fuelPurchaseRows.reduce((sum, p) => sum + (p.paidAmount ?? 0), 0);
  const dieselCosts = dieselRows.reduce((sum, d) => sum + (d.costAmount ?? 0), 0);
  // Bug fix: this used to exclude ledger category "FUEL" on the premise
  // that fuel-purchase-supplier settlements were "already counted via
  // FuelPurchase.amount above." That's false — createFuelPurchase
  // (fuelPurchase.service.ts) deliberately never posts to ledgerEntries at
  // all (suppliers live in a dedicated `suppliers` table, not `people`,
  // so there's no valid ledger link). No current code path creates a
  // FUEL-category ledger entry; the only way one exists is legacy data or
  // a manual reassignment via EditLedgerEntryModal.tsx (which still offers
  // "Fuel" as a category). Excluding it here silently dropped that real
  // money from moneySpent/otherPayments for any kiln with such a row.
  const otherPaymentEntries = paidEntries;
  const otherPayments = otherPaymentEntries.reduce((sum, e) => sum + e.amount, 0);
  const moneySpent = expenseCosts + fuelCosts + dieselCosts + otherPayments;

  const bricksSold = dispatchRows.reduce((sum, d) => sum + d.bricksCount, 0);

  const moneyInSplits = [
    splitByPaymentMode(invoiceRows, (inv) => inv.amountPaidNow ?? inv.netAmount),
    splitByPaymentMode(unInvoicedDispatches, (d) => d.amount),
  ];
  const moneyInSplit = {
    cash: round2(moneyInSplits.reduce((sum, s) => sum + s.cash, 0)),
    online: round2(moneyInSplits.reduce((sum, s) => sum + s.online, 0)),
    unspecified: round2(moneyInSplits.reduce((sum, s) => sum + s.unspecified, 0)),
  };
  const outSplits = [
    splitByPaymentMode(expenseRows, (e) => e.amount),
    splitByPaymentMode(fuelPurchaseRows, (p) => p.paidAmount ?? 0),
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

export async function financialOverview(kilnId: string, seasonId: string) {
  const now = new Date();
  // Bug fix: `now.getFullYear()` reads the server's own (UTC) local year —
  // during the ~5.5h window each year where it's already Jan 1 in IST but
  // still Dec 31 UTC, this resolved "last year" a day early relative to
  // istStartOfDay's own IST-correct boundary below. istDateOnly resolves
  // the correct IST calendar year first.
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(istDateOnly(now).getUTCFullYear() - 1);

  const startOfDay = istStartOfDay(now);
  const weekAgo = istStartOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  // Bug fix (admin decision): "This month" used to be a rolling trailing-
  // 30-day window — the Reports page has a "This Month" preset with the
  // exact same label that means the true calendar month (1st to today),
  // so the two could show different figures for what looked like the same
  // thing. Now the true IST calendar month: 1st of the current month
  // through today. istDateOnly resolves "today" to its IST calendar date
  // first, so this can't be thrown off by the server's own timezone.
  const todayIst = istDateOnly(now);
  const firstOfMonth = new Date(Date.UTC(todayIst.getUTCFullYear(), todayIst.getUTCMonth(), 1));
  const monthAgo = istStartOfDay(firstOfMonth);
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
