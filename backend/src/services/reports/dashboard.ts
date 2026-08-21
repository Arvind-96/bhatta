import { listPaymentsDue, listOutstandingAdvances } from "../person.service";
import { listSalaryStatus, currentMonthString } from "../salary.service";
import { listCustomers, getCustomerDetail } from "../customer.service";
import { listLedgerForKiln } from "../ledger.service";
import { db } from "../../db/client";
import { moldingEntries, stackingEntries, nikasiEntries } from "../../db/schema";
import { and, eq, gte } from "drizzle-orm";
import { round2 } from "./types";

export interface DashboardSummary {
  totalPendingDues: number;
  totalOutstandingAdvances: number;
  categoryBreakdownThisMonth: { category: string; paid: number; due: number }[];
  bricksDamagedThisWeek: number;
  topPendingDues: { personId: string; name: string; type: string; amountDue: number }[];
  topOutstandingAdvances: { personId: string; name: string; type: string; outstandingAdvance: number }[];
  salaryStatusThisMonth: { totalStaff: number; generated: number; pending: number };
  totalCustomerDue: number;
}

// The "single centralized dashboard" summary — every number here is
// derived from functions that already exist and already drive their own
// pages (Overview's outstanding-advances list, the Salary page's status
// grid, Customer balances) so nothing here can drift from what those pages
// show; this just pulls them all onto one screen.
export async function dashboardSummary(kilnId: string): Promise<DashboardSummary> {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [paymentsDue, outstandingAdvances, monthLedger, customers, salaryStatus, moldingWeek, stackingWeek, nikasiWeek] = await Promise.all([
    listPaymentsDue(kilnId),
    listOutstandingAdvances(kilnId),
    listLedgerForKiln(kilnId, { from: firstOfMonth, to: now }),
    listCustomers(kilnId),
    listSalaryStatus(kilnId, currentMonthString()),
    db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, weekAgo))),
    db.select().from(stackingEntries).where(and(eq(stackingEntries.kilnId, kilnId), gte(stackingEntries.date, weekAgo))),
    db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), gte(nikasiEntries.date, weekAgo))),
  ]);

  const categoryTotals = new Map<string, { paid: number; due: number }>();
  for (const e of monthLedger) {
    const cat = e.category ?? "OTHER";
    const bucket = categoryTotals.get(cat) ?? { paid: 0, due: 0 };
    if (e.direction === "PAID") bucket.paid += e.amount;
    else bucket.due += e.amount;
    categoryTotals.set(cat, bucket);
  }
  const categoryBreakdownThisMonth = Array.from(categoryTotals.entries())
    .filter(([cat]) => ["ADVANCE", "KHARCHI", "MEDICAL", "FESTIVAL", "FARE"].includes(cat))
    .map(([category, { paid, due }]) => ({ category, paid: round2(paid), due: round2(due) }));

  const customerDetails = await Promise.all(customers.map((c) => getCustomerDetail(kilnId, c._id)));
  const totalCustomerDue = round2(customerDetails.reduce((s, d) => s + Math.max(0, d.totalDue), 0));

  const bricksDamagedThisWeek =
    moldingWeek.reduce((s, e) => s + (e.damagedCount ?? 0), 0) +
    stackingWeek.reduce((s, e) => s + (e.damageCount ?? 0), 0) +
    nikasiWeek.reduce((s, e) => s + (e.damagedCount ?? 0), 0);

  return {
    totalPendingDues: round2(paymentsDue.reduce((s, p) => s + p.amountDue, 0)),
    totalOutstandingAdvances: round2(outstandingAdvances.reduce((s, a) => s + a.outstandingAdvance, 0)),
    categoryBreakdownThisMonth,
    bricksDamagedThisWeek,
    topPendingDues: paymentsDue.slice(0, 5).map((p) => ({ personId: p.person.id, name: p.person.name, type: p.person.type, amountDue: p.amountDue })),
    topOutstandingAdvances: outstandingAdvances.slice(0, 5).map((a) => ({ personId: a.person._id, name: a.person.name, type: a.person.type, outstandingAdvance: a.outstandingAdvance })),
    salaryStatusThisMonth: {
      totalStaff: salaryStatus.length,
      generated: salaryStatus.filter((s) => s.slip).length,
      pending: salaryStatus.filter((s) => !s.slip).length,
    },
    totalCustomerDue,
  };
}
