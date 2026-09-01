import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ledgerEntries, people } from "../db/schema";
import { flowForRange } from "./financialOverview.service";

// The Profit & Loss page's own line items — built on top of
// financialOverview.service.ts's flowForRange (the same cash-basis
// money-in/money-out accounting Financial Overview already uses, so this
// page's totals can never disagree with that one), plus two additional
// breakouts flowForRange doesn't expose on its own: Advances Given and
// Advances Received, both subsets already folded into moneyOut/moneyIn
// above (not added on top of them — showing "who got an advance" as
// detail, not extra money).
//
// Advances Given = ledger entries where the kiln paid someone money under
// category ADVANCE (direction PAID) — staff/contractor/supplier advances,
// same definition salary.service.ts and molding.service.ts already use.
// Advances Received = the mirror case, a DUE-direction ADVANCE entry —
// someone (most commonly a Partner) put capital into the kiln that the
// kiln now owes back, recorded as a liability the same way every other
// DUE entry increases what's owed to that person.
//
// Overall profit/loss is exactly (money in) − (money out) — the same
// netCashFlow flowForRange itself computes — so "Total Sales"/"Total
// Expenses"/"Total Advances Given/Received" are informational breakdowns
// of that one number, never separately added into it (that would
// double-count rupees already inside moneyIn/moneyOut).
export async function profitLossStatement(kilnId: string, seasonId: string | null, since: Date, until?: Date) {
  const dateRange = until ? and(gte(ledgerEntries.date, since), lte(ledgerEntries.date, until)) : gte(ledgerEntries.date, since);

  const [flow, advanceRows] = await Promise.all([
    flowForRange(kilnId, seasonId, since, until),
    db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.category, "ADVANCE"), dateRange)),
  ]);

  const advancesGiven = Math.round(advanceRows.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const advancesReceived = Math.round(advanceRows.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0) * 100) / 100;

  const netProfit = flow.netCashFlow;

  const partners = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "PARTNER"), eq(people.active, true)));
  const partnerShares = partners.map((p) => ({
    partnerId: p._id,
    name: p.name,
    sharePercent: p.profitSharePercent ?? 0,
    shareAmount: Math.round(netProfit * ((p.profitSharePercent ?? 0) / 100) * 100) / 100,
  }));
  const totalSharedPercent = Math.round(partnerShares.reduce((sum, p) => sum + p.sharePercent, 0) * 100) / 100;
  const unallocatedPercent = Math.max(0, Math.round((100 - totalSharedPercent) * 100) / 100);
  const unallocatedAmount = Math.round(netProfit * (unallocatedPercent / 100) * 100) / 100;

  return {
    totalSales: flow.moneyReceived,
    totalExpenses: flow.breakdown.expenses,
    totalAdvancesGiven: advancesGiven,
    totalAdvancesReceived: advancesReceived,
    cashReceived: flow.moneyIn.cash,
    cashGiven: flow.moneyOut.cash,
    onlinePaymentsReceived: flow.moneyIn.online,
    onlinePaymentsMade: flow.moneyOut.online,
    totalMoneyIn: flow.moneyReceived,
    totalMoneyOut: flow.moneySpent,
    netProfit,
    partnerShares,
    totalSharedPercent,
    unallocatedPercent,
    unallocatedAmount,
  };
}
