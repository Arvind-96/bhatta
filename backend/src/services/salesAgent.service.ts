import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { people } from "../db/schema";
import { getBalance } from "./person.service";
import { listInvoices } from "./dispatchDocuments.service";

// Every invoice attributed to this agent, reduced to the distinct
// customers behind them — "which customers are receiving bricks through
// this agent," per the admin's own framing. One row per customer, most
// recent sale first, with a running total so a busy agent's top customers
// are obvious at a glance without cross-referencing the raw invoice list.
function customersFromInvoices(invoicesThrough: Awaited<ReturnType<typeof listInvoices>>) {
  const byCustomer = new Map<string, { customerId: string | null; customerName: string; totalSales: number; invoiceCount: number; lastSaleDate: Date | null }>();
  for (const inv of invoicesThrough) {
    const key = inv.customerId ?? `name:${inv.customerName.toLowerCase()}`;
    const bucket = byCustomer.get(key) ?? { customerId: inv.customerId, customerName: inv.customerName, totalSales: 0, invoiceCount: 0, lastSaleDate: null };
    bucket.totalSales += inv.netAmount;
    bucket.invoiceCount += 1;
    const saleDate = inv.invoiceDate ?? inv.createdAt;
    if (saleDate && (!bucket.lastSaleDate || saleDate > bucket.lastSaleDate)) bucket.lastSaleDate = saleDate;
    byCustomer.set(key, bucket);
  }
  return Array.from(byCustomer.values()).sort((a, b) => (b.lastSaleDate?.getTime() ?? 0) - (a.lastSaleDate?.getTime() ?? 0));
}

// This calendar month's sales against monthlySalesTarget — a real
// calendar-month figure (like Overview's own "this month" widgets),
// deliberately not season-scoped, since a sales target is a fixed-period
// goal independent of when a Bhatta Season happens to start or end.
function currentMonthSales(invoicesThrough: Awaited<ReturnType<typeof listInvoices>>): number {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const total = invoicesThrough
    .filter((inv) => {
      const saleDate = inv.invoiceDate ?? inv.createdAt;
      return saleDate != null && saleDate >= startOfMonth;
    })
    .reduce((sum, inv) => sum + inv.netAmount, 0);
  return Math.round(total * 100) / 100;
}

// Full agent profile: the person record (commission type/rate, monthly
// target, referral code), their running ledger balance (COMMISSION due/
// paid, same shared ledgerEntries table every other person type uses),
// every invoice attributed to them, and that invoice list rolled up per
// customer.
export async function getSalesAgentDetail(kilnId: string, agentId: string) {
  const agent = (await db.select().from(people).where(and(eq(people._id, agentId), eq(people.kilnId, kilnId))))[0];
  if (!agent) throw new Error("Sales agent not found in this kiln");

  const [balance, invoicesThrough] = await Promise.all([
    getBalance(kilnId, agentId),
    listInvoices(kilnId, null, { agentId }),
  ]);

  const customers = customersFromInvoices(invoicesThrough);
  const totalSales = Math.round(invoicesThrough.reduce((sum, inv) => sum + inv.netAmount, 0) * 100) / 100;
  const monthSales = currentMonthSales(invoicesThrough);

  return { agent, balance, invoicesThrough, customers, totalSales, monthSales };
}

// Every SALES_AGENT, ranked by total commission ledger balance (due minus
// paid) — the leaderboard the Sales Agent list page shows so the admin can
// see who's earning the most / owed the most at a glance, without opening
// each profile individually.
export async function listSalesAgentsWithSummary(kilnId: string) {
  const agents = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "SALES_AGENT"), eq(people.active, true)));

  const results = await Promise.all(
    agents.map(async (agent) => {
      const [balance, invoicesThrough] = await Promise.all([
        getBalance(kilnId, agent._id),
        listInvoices(kilnId, null, { agentId: agent._id }),
      ]);
      return {
        agent,
        balance,
        totalSales: Math.round(invoicesThrough.reduce((sum, inv) => sum + inv.netAmount, 0) * 100) / 100,
        customerCount: customersFromInvoices(invoicesThrough).length,
        invoiceCount: invoicesThrough.length,
      };
    })
  );

  return results.sort((a, b) => b.balance - a.balance);
}
