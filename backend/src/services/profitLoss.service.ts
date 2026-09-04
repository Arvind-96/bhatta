import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ledgerEntries, people } from "../db/schema";
import { flowForRange } from "./financialOverview.service";

// The Profit & Loss page's own line items — built on top of
// financialOverview.service.ts's flowForRange (the same cash-basis
// money-in/money-out accounting Financial Overview already uses, so this
// page's totals can never disagree with that one), plus one additional
// breakout flowForRange doesn't expose on its own: Advances Given, a
// subset already folded into moneyOut above (not added on top of it —
// showing "who got an advance" as detail, not extra money).
//
// Advances Given = ledger entries where the kiln paid someone money under
// category ADVANCE (direction PAID) — staff/contractor/supplier advances,
// same definition salary.service.ts and molding.service.ts already use.
//
// Removed by admin decision: "Advances Received" (the mirror DUE-direction
// ADVANCE case) used to be shown here, but every entry that ever populated
// it turned out to be a Soil/Sand/Land-Lease contract's advance being
// revised down or reversed on delete — a correction to money the kiln
// already PAID OUT, not real capital coming in. There is no working UI
// path for the figure's actual intended source (a Partner injecting
// capital — LedgerModal.tsx hides the ADVANCE category entirely for
// Partner-type people), so it never meant what it claimed to.
//
// Overall profit/loss is exactly (money in) − (money out) — the same
// netCashFlow flowForRange itself computes — so "Total Sales"/"Total
// Expenses"/"Total Advances Given" are informational breakdowns of that
// one number, never separately added into it (that would double-count
// rupees already inside moneyIn/moneyOut).
export async function profitLossStatement(kilnId: string, seasonId: string | null, since: Date, until?: Date) {
  const dateRange = until ? and(gte(ledgerEntries.date, since), lte(ledgerEntries.date, until)) : gte(ledgerEntries.date, since);

  const [flow, advanceRows] = await Promise.all([
    flowForRange(kilnId, seasonId, since, until),
    db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.category, "ADVANCE"), eq(ledgerEntries.direction, "PAID"), dateRange)),
  ]);

  const advancesGiven = Math.round(advanceRows.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;

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
    // Bug fix: this used to be `flow.breakdown.expenses`, which is ONLY the
    // Expense-table total — it silently excluded fuel purchases, diesel,
    // and every other PAID ledger entry (wages, salaries, soil/sand
    // settlements, kharchi, medical, festival, advances), all of which ARE
    // included in `flow.moneySpent` and in Cash Given/Online Payments Made
    // right next to this tile. `moneySpent` is the comprehensive figure —
    // matching how Total Sales already correctly uses the comprehensive
    // `flow.moneyReceived`, not a subset of it.
    totalExpenses: flow.moneySpent,
    totalAdvancesGiven: advancesGiven,
    cashReceived: flow.moneyIn.cash,
    cashGiven: flow.moneyOut.cash,
    onlinePaymentsReceived: flow.moneyIn.online,
    onlinePaymentsMade: flow.moneyOut.online,
    // Bug fix: a row with no paymentMode recorded (legacy data, or a form —
    // e.g. CreateChallanForm.tsx — that never collects one) contributes to
    // neither cash nor online; without surfacing that gap explicitly,
    // Cash Received + Online Payments Received can silently fall short of
    // Total Sales with no explanation on the page. Financial Overview
    // already surfaces this same figure (moneyInUnspecified/
    // moneyOutUnspecified) — exposing it here too instead of only in the
    // frontend's field naming.
    moneyInUnspecified: flow.moneyIn.unspecified,
    moneyOutUnspecified: flow.moneyOut.unspecified,
    totalMoneyIn: flow.moneyReceived,
    totalMoneyOut: flow.moneySpent,
    netProfit,
    partnerShares,
    totalSharedPercent,
    unallocatedPercent,
    unallocatedAmount,
  };
}
