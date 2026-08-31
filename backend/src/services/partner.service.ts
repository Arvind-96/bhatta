import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { people } from "../db/schema";
import { getBalance } from "./person.service";
import { listPartnerAssets } from "./partnerAsset.service";
import { listInvoices } from "./dispatchDocuments.service";
import { seasonFinancialSummary } from "./financialReport.service";

// A partner's share of the kiln's own profit for the period — their
// profitSharePercent against seasonFinancialSummary's own netProfit
// figure, so this can never disagree with what the Financial Report page
// itself shows for the same period. Deliberately NOT tied to only the
// invoices attributed to this partner (see the app's own design decision:
// a profit-sharing partner in a bhatta shares in the whole kiln's
// performance, not just the sales that happened to list them).
export async function partnerProfitShare(kilnId: string, seasonId: string, partnerId: string, days = 30) {
  const partner = (await db.select().from(people).where(and(eq(people._id, partnerId), eq(people.kilnId, kilnId))))[0];
  if (!partner) throw new Error("Partner not found in this kiln");

  const summary = await seasonFinancialSummary(kilnId, seasonId, days);
  const sharePercent = partner.profitSharePercent ?? 0;
  const shareAmount = Math.round(summary.netProfit * (sharePercent / 100) * 100) / 100;

  return { days, sharePercent, kilnNetProfit: summary.netProfit, shareAmount };
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
