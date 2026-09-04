import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { people } from "../db/schema";
import { getBalance } from "./person.service";
import { listPartnerAssets } from "./partnerAsset.service";
import { listInvoices } from "./dispatchDocuments.service";
import { flowForRange } from "./financialOverview.service";
import { istStartOfDay } from "../utils/istTime";

// A partner's share of the kiln's own profit for the period — their
// profitSharePercent against the SAME flowForRange-based netCashFlow
// figure profitLoss.service.ts's partnerShares uses for the Profit & Loss
// page's Partner Share table, so a partner can never see two disagreeing
// numbers for themselves across the two pages. (This used to read
// seasonFinancialSummary's DUE-based netProfit instead — a different
// accounting basis from flowForRange's PAID-based netCashFlow — which is
// exactly why the two pages could disagree.) Deliberately NOT tied to only
// the invoices attributed to this partner (see the app's own design
// decision: a profit-sharing partner in a bhatta shares in the whole
// kiln's performance, not just the sales that happened to list them).
//
// Bug fix: unifying the accounting BASIS above wasn't enough on its own —
// this still computed `since` as a raw "exactly `days`×24h before this
// instant", continuously sliding, while profitLoss.controller.ts's own
// default (no explicit from/to picked) resolves to `istStartOfDay(now −
// 30 days)`, a fixed IST-day boundary. The two could still disagree by up
// to a day's worth of transactions near the edge of the window even after
// the basis fix. The Partners page has no date picker of its own, so it
// can only ever match Profit & Loss's DEFAULT (untouched) 30-day view —
// matching that exactly, rather than an approximation of it, is what this
// fixes. Picking a custom range on the Profit & Loss page will still
// (correctly, expectedly) show a different partner-share number there,
// since Partners has nothing to sync a custom range against.
export async function partnerProfitShare(kilnId: string, seasonId: string, partnerId: string, days = 30) {
  const partner = (await db.select().from(people).where(and(eq(people._id, partnerId), eq(people.kilnId, kilnId))))[0];
  if (!partner) throw new Error("Partner not found in this kiln");

  const since = istStartOfDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  const flow = await flowForRange(kilnId, seasonId, since);
  const sharePercent = partner.profitSharePercent ?? 0;
  const shareAmount = Math.round(flow.netCashFlow * (sharePercent / 100) * 100) / 100;

  return { days, sharePercent, kilnNetProfit: flow.netCashFlow, shareAmount };
}

// Full partner profile: the person record, their contributed assets,
// their running ledger balance (PARTNER_DUE liabilities from customer
// dues attributed to them, plus any manually-recorded withdrawals/
// settlements — same shared ledgerEntries table every other person
// type uses), and their profit-share figure for the given period.
export async function getPartnerDetail(kilnId: string, seasonId: string, partnerId: string, days = 30) {
  const partner = (await db.select().from(people).where(and(eq(people._id, partnerId), eq(people.kilnId, kilnId))))[0];
  if (!partner) throw new Error("Partner not found in this kiln");

  const [assets, balance, profitShare, invoicesThrough] = await Promise.all([
    listPartnerAssets(kilnId, partnerId),
    getBalance(kilnId, partnerId),
    partnerProfitShare(kilnId, seasonId, partnerId, days),
    listInvoices(kilnId, null, { partnerId }),
  ]);

  return { partner, assets, balance, profitShare, invoicesThrough };
}
