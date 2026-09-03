import { ReportGroupBy } from "../../utils/reportPeriod";

export type ReportColumnFormat = "date" | "currency" | "number" | "text";

export interface ReportColumn {
  key: string;
  labelKey: string;
  format: ReportColumnFormat;
}

export interface ProductionSummary {
  bricksCount: number;
  damagedCount: number;
  byModule: { module: string; bricksCount: number; damagedCount: number }[];
}

export interface ContractorRollupGroup {
  contractorId: string;
  contractorName: string;
  totalDue: number;
  totalPaid: number;
  netAmount: number;
  bricksCount: number;
  damagedCount: number;
  laborerCount: number;
  laborers: { personId: string; name: string; type: string; totalDue: number; totalPaid: number; netAmount: number; bricksCount: number; damagedCount: number }[];
}

export interface ReportResult {
  reportKey: string;
  titleKey: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
  // "Every brick" alongside "every penny" — attached only when a report is
  // scoped to exactly one person or one contractor's gang (see
  // productionTotals.ts). Additive/optional so the flat-table contract
  // every other report relies on is unaffected.
  productionSummary?: ProductionSummary;
  // The hierarchical contractor->laborers view (labourByContractor only) —
  // `rows` above is a flattened version of the same data for Print/Excel;
  // the on-screen collapsible view reads this instead.
  groups?: ContractorRollupGroup[];
}

export interface ReportFilters {
  from?: Date;
  to?: Date;
  groupBy?: ReportGroupBy;
  personId?: string;
  personType?: string;
  customerId?: string;
  supplierId?: string;
  agentId?: string;
  vehicleId?: string;
  driverId?: string;
  category?: string;
  contractorId?: string;
  categoryId?: string;
  damageFault?: string;
  damageThreshold?: number;
  workType?: string;
  status?: string;
}

export type ReportRunner = (kilnId: string, filters: ReportFilters) => Promise<ReportResult>;

export interface ReportDefinition {
  key: string;
  titleKey: string;
  run: ReportRunner;
}

// Every list function in this codebase that resolves a foreign id enriches
// it in place with the referenced row (see e.g. workEntry.service.ts's
// listWorkEntries) — this pulls a display name back out of that shape (or
// passes through a plain string/null unresolved id) so report rows can stay
// flat strings, per the ReportResult contract.
export function refName(ref: unknown): string | null {
  if (ref == null) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && "name" in (ref as Record<string, unknown>)) {
    return ((ref as Record<string, unknown>).name as string) ?? null;
  }
  return null;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Cash/online split for one row's own contribution to a period total —
// same convention financialOverview.service.ts's splitByPaymentMode uses
// (a plain CASH row counts fully as cash, BANK/UPI/GST_INVOICE fully as
// online, CASH_AND_ONLINE by its own recorded cashAmount:onlineAmount
// ratio), just row-at-a-time rather than pre-aggregated, so a report can
// sum it alongside its own other per-row totals. A row with no
// paymentMode recorded contributes 0 to both (never guessed) — callers
// summing this across many rows should treat cash+online < amount as
// "some rows have no payment mode on file" rather than a discrepancy.
export function cashOnlineSplit(paymentMode: string | null | undefined, cashAmount: number | null | undefined, onlineAmount: number | null | undefined, amount: number) {
  if (!paymentMode) return { cash: 0, online: 0 };
  if (paymentMode === "CASH") return { cash: amount, online: 0 };
  if (paymentMode === "CASH_AND_ONLINE") {
    const recordedCash = cashAmount ?? 0;
    const recordedOnline = onlineAmount ?? 0;
    const recordedTotal = recordedCash + recordedOnline;
    if (recordedTotal <= 0) return { cash: 0, online: 0 };
    return { cash: round2((recordedCash / recordedTotal) * amount), online: round2((recordedOnline / recordedTotal) * amount) };
  }
  return { cash: 0, online: amount }; // BANK / UPI / GST_INVOICE
}

export interface FifoInvoiceRow {
  dispatchId: string | null;
  bricksCount: number;
  netAmount: number;
  amountPaidNow: number | null;
  paymentMode: string | null;
  cashAmount: number | null;
  onlineAmount: number | null;
  invoiceDate: Date | null;
  createdAt: Date | null;
}

// A later top-up payment against an earlier due is logged as its own
// separate, un-dispatched Invoice (see AddCustomerPaymentModal) — it never
// touches the original sale's own amountPaidNow, so left alone that
// original dispatch's own "due" keeps showing the original shortfall
// forever, even once the customer has genuinely paid it off. This walks
// one customer's full invoice history in date order and applies every
// payment — whether it's a later 0-brick top-up or an overpayment on a
// real sale — to the MOST RECENTLY opened still-open charge first (LIFO).
// Confirmed against real client data, not assumed: for one customer with
// two simultaneously-open dues (an older ₹26,000 shortfall from Aug 8, a
// newer ₹4,000 shortfall from Aug 12), a ₹4,000 top-up on Aug 13 was
// independently confirmed by the client to have paid off the Aug 12 due
// while the Aug 8 due stayed outstanding — i.e. customers settle their
// most recent purchase first and carry older balances forward, the
// opposite of textbook oldest-first AR application. Returns, per
// dispatchId: the true remaining due after all of that customer's
// payments are accounted for, and any EXTRA cash/online that a later
// payment contributed toward it (so a report row's own cash+online+due
// still sums to its own billed amount instead of quietly losing track of
// the ₹X a later, separate payment actually settled).
//
// Shared by production.reports.ts's Sale report and trade.reports.ts's
// Invoices report — both show one row per dispatch/invoice and both need
// the SAME resolved due, or the two reports silently disagree again (the
// exact class of bug this whole redesign engagement has been about).
export function fifoResolveCustomerDues(customerInvoices: FifoInvoiceRow[]) {
  const sorted = [...customerInvoices].sort((a, b) => (a.invoiceDate ?? a.createdAt ?? new Date(0)).getTime() - (b.invoiceDate ?? b.createdAt ?? new Date(0)).getTime());
  const openStack: { dispatchId: string; remaining: number }[] = [];
  const extraCash = new Map<string, number>();
  const extraOnline = new Map<string, number>();
  // Every dispatchId that ever had a shortfall pushed gets an entry here,
  // kept in sync on every push and every partial/full credit application —
  // including 0 once fully cleared. Deriving this only from what's left in
  // openStack at the very end would silently drop any dispatch a later
  // payment fully settled (it's popped off the stack once cleared), and
  // the caller's own fallback for a "not found" dispatch is the ORIGINAL
  // pre-payment shortfall, not 0 — so a settled due would wrongly reread
  // as still fully outstanding.
  const remainingDue = new Map<string, number>();

  function applyCredit(amount: number, paymentMode: string | null, cashAmount: number | null, onlineAmount: number | null) {
    if (amount <= 0) return;
    const split = cashOnlineSplit(paymentMode, cashAmount, onlineAmount, amount);
    let cashLeft = split.cash;
    let onlineLeft = split.online;
    while ((cashLeft > 0.005 || onlineLeft > 0.005) && openStack.length > 0) {
      const top = openStack[openStack.length - 1];
      const totalLeft = round2(cashLeft + onlineLeft);
      const applied = Math.min(top.remaining, totalLeft);
      if (applied <= 0) break;
      const fromCash = totalLeft > 0 ? round2((cashLeft / totalLeft) * applied) : 0;
      const fromOnline = round2(applied - fromCash);
      extraCash.set(top.dispatchId, round2((extraCash.get(top.dispatchId) ?? 0) + fromCash));
      extraOnline.set(top.dispatchId, round2((extraOnline.get(top.dispatchId) ?? 0) + fromOnline));
      cashLeft = round2(cashLeft - fromCash);
      onlineLeft = round2(onlineLeft - fromOnline);
      top.remaining = round2(top.remaining - applied);
      remainingDue.set(top.dispatchId, top.remaining);
      if (top.remaining <= 0.005) openStack.pop();
    }
  }

  for (const inv of sorted) {
    const charge = inv.bricksCount > 0 ? inv.netAmount : 0;
    const paidNow = inv.amountPaidNow ?? inv.netAmount;
    if (charge > 0) {
      const shortfall = round2(charge - paidNow);
      if (shortfall > 0.005 && inv.dispatchId) {
        openStack.push({ dispatchId: inv.dispatchId, remaining: shortfall });
        remainingDue.set(inv.dispatchId, shortfall);
      } else if (shortfall < -0.005) {
        applyCredit(-shortfall, inv.paymentMode, inv.cashAmount, inv.onlineAmount);
      }
    } else {
      applyCredit(paidNow, inv.paymentMode, inv.cashAmount, inv.onlineAmount);
    }
  }

  return { remainingDue, extraCash, extraOnline };
}
