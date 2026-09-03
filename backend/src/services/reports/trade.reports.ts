import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../../db/client";
import { kilns, brickLoadingEntries, dispatches, invoices as invoicesTable } from "../../db/schema";
import { listCustomers } from "../customer.service";
import { listInvoices, listGatePasses, listChallans, formatInvoiceNumber } from "../dispatchDocuments.service";
import { listExpenses } from "../expense.service";
import { listExpenseTypes } from "../expenseType.service";
import { listBrickCategories } from "../brickCategory.service";
import { itemsOrLegacyFallback } from "../brickLineItems.util";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, cashOnlineSplit, round2, fifoResolveCustomerDues } from "./types";

type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>[number];
// A synthetic, Invoice-shaped stand-in for a Dispatch nobody has generated
// a formal Invoice for yet — same real sale, same money, just no GST
// document printed against it. Shaped to slot directly into every one of
// this file's invoice-consuming reports (customers/invoices/
// salesByCustomerCategory) unchanged: `dispatchId` is the dispatch's own
// id (so the Invoices report's loading/unloading-charge lookup still
// resolves it), amountPaidNow mirrors the dispatch's own "assumed fully
// paid, no partial-payment concept" convention (brickLoading.service.ts
// uses the same fallback), and session/sessionSerialNumber/sequenceNumber
// stay null since no invoice number was ever actually issued —
// formatInvoiceNumber already renders that as "INV-—", and the Invoices
// report below overrides it to a clearer label.
type SyntheticRow = InvoiceRow & { _synthetic: true };

// Same reasoning financialOverview.service.ts's flowForRange already
// established for Overview/Financial Overview's own totals: a Dispatch
// nobody has generated a formal Invoice for yet is still a real, complete
// sale, and every report here that reads listInvoices alone silently
// dropped it — undercounting Invoices/Customers/Sales-by-Category by
// however much real, physically-dispatched brick never got billed.
// Confirmed against real production data: two customers' real sales
// (₹73,500 combined) were fully present in the Sale/Production report
// (which reads dispatches directly) but completely absent from every
// invoice-based report, explaining part of why the client's own manual
// total never matched the software's.
// No customerId param — deliberately kiln-wide. A dispatch nobody's ever
// invoiced often has no customerId of its own either (just a free-text
// customerName snapshot from whoever typed it at dispatch time, unlinked
// from the tracked Customer record — confirmed against real data: one
// such dispatch's customerName was "Harcharan " with a trailing-space
// typo, customerId null, while the tracked Customer is named "Harcharan"
// cleanly). Filtering this query by customerId at the SQL level would
// silently drop exactly the unlinked rows this function exists to
// surface. Callers that need one customer's slice filter afterward with
// belongsToCustomer below, the same customerId-OR-matching-name fallback
// listInvoicesForCustomer already established for real invoices.
async function unbilledDispatchRows(kilnId: string, filters: { from?: Date; to?: Date }): Promise<SyntheticRow[]> {
  const dateRange = [];
  if (filters.from) dateRange.push(gte(dispatches.dispatchedOn, filters.from));
  if (filters.to) dateRange.push(lte(dispatches.dispatchedOn, filters.to));

  const [dispatchRows, invoicedDispatchIdRows] = await Promise.all([
    db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), ...dateRange)),
    // Kiln-wide, NOT date-ranged — same reasoning as flowForRange's own
    // identical query: this only answers "does this dispatch have an
    // invoice at all, ever", regardless of when that invoice was dated.
    db.select({ dispatchId: invoicesTable.dispatchId }).from(invoicesTable).where(and(eq(invoicesTable.kilnId, kilnId), isNotNull(invoicesTable.dispatchId))),
  ]);

  const invoicedDispatchIds = new Set(invoicedDispatchIdRows.map((r) => r.dispatchId));
  return dispatchRows
    .filter((d) => !invoicedDispatchIds.has(d._id))
    .map(
      (d) =>
        ({
          _id: `dispatch:${d._id}`,
          kilnId: d.kilnId,
          seasonId: d.seasonId,
          dispatchId: d._id,
          customerId: d.customerId,
          partnerId: null,
          agentId: null,
          sequenceNumber: null,
          customerName: d.customerName,
          customerAddress: d.customerAddress,
          customerPhone: d.customerPhone,
          customerGstNumber: null,
          customerStateCode: null,
          vehicleNumber: d.vehicleNumber,
          gstRatePercent: null,
          gstType: null,
          session: null,
          sessionSerialNumber: null,
          termsAndConditions: null,
          categoryId: d.categoryId,
          bricksCount: d.bricksCount,
          items: d.items,
          ratePerBrick: null,
          grossAmount: null,
          discountAmount: d.discountAmount,
          netAmount: d.amount,
          amountPaidNow: d.amount,
          paymentMode: d.paymentMode,
          cashAmount: d.cashAmount,
          onlineAmount: d.onlineAmount,
          placeOfSupply: d.placeOfSupply,
          invoiceDate: d.dispatchedOn,
          notes: d.notes,
          createdAt: d.createdAt,
          _synthetic: true,
        }) as unknown as SyntheticRow
    );
}

// Same customerId-OR-matching-name convention listInvoicesForCustomer uses
// for real invoices — a row belongs to this customer if it's explicitly
// linked by id, or if it's unlinked (customerId null) but its own
// customerName matches case/whitespace-insensitively.
function belongsToCustomer(row: { customerId?: string | null; customerName: string }, customerId: string, customerName: string): boolean {
  if (row.customerId) return row.customerId === customerId;
  return row.customerName.trim().toLowerCase() === customerName.trim().toLowerCase();
}

// One row per customer, totals scoped to the requested period only (not
// lifetime balance — the Customer page already shows that) — satisfies
// "per individual or bulk (all customers)" via the optional customerId
// filter. No groupBy: this is inherently an entity rollup, not a time
// series (see the Invoices report below for the date-bucketed view).
const customers: ReportDefinition = {
  key: "customers",
  titleKey: "reports.title.customers",
  async run(kilnId, filters) {
    const allCustomers = await listCustomers(kilnId);
    const scoped = filters.customerId ? allCustomers.filter((c) => c._id === filters.customerId) : allCustomers;
    // Fetched once, kiln-wide — see unbilledDispatchRows' own comment on
    // why it can't be scoped by customerId at the query level.
    const allUnbilled = await unbilledDispatchRows(kilnId, { from: filters.from, to: filters.to });

    const rows = await Promise.all(
      scoped.map(async (c) => {
        // Same charge/paid split getCustomerDetail uses (customer.service.ts)
        // and the Customer profile's own Invoices table: a 0-brick row (see
        // AddCustomerPaymentModal.tsx) is an advance/general payment, not a
        // real sale, so it contributes to paidThisPeriod but not to
        // invoicedThisPeriod — counting its netAmount as "invoiced" too
        // double-weighted every advance payment into dueThisPeriod (e.g. a
        // customer whose only 0-brick row was a ₹4,000 advance showed
        // ₹4,000 too much due, since that ₹4,000 was being added as a
        // charge AND already subtracted back out as a payment).
        const realInvoices = await listInvoices(kilnId, null, { customerId: c._id, from: filters.from, to: filters.to });
        const unbilled = allUnbilled.filter((d) => belongsToCustomer(d, c._id, c.name));
        const invoices = [...realInvoices, ...unbilled];
        const invoicedThisPeriod = round2(invoices.reduce((s, i) => s + (i.bricksCount > 0 ? i.netAmount : 0), 0));
        const paidThisPeriod = round2(invoices.reduce((s, i) => s + (i.amountPaidNow ?? i.netAmount), 0));
        // A customer whose only activity this period was a 0-brick advance
        // (invoicedThisPeriod 0, paidThisPeriod > 0) nets to a NEGATIVE raw
        // due — mathematically a credit, not a due, and confusing to show
        // as a negative number sitting next to two positive figures that
        // otherwise look like they should just subtract cleanly to 0. "Due"
        // is clamped at 0 (a due can't sensibly be negative) and whatever
        // it would have gone negative by is surfaced as its own
        // creditThisPeriod instead, so the money is still visible, just not
        // disguised as a below-zero "due".
        const rawDue = round2(invoicedThisPeriod - paidThisPeriod);
        // Cash/online actually collected from THIS customer, summed across
        // every one of their invoices this period — including a later
        // top-up payment against an earlier due (AddCustomerPaymentModal's
        // own 0-brick advance invoice), since that's a real invoice row
        // like any other and correctly carries its own paymentMode/split.
        // This is the one place in the app that answers "who paid how much
        // cash vs online" per customer, correctly netted across however
        // many separate invoices/payments it took.
        let cashPaid = 0;
        let onlinePaid = 0;
        for (const inv of invoices) {
          const paidNow = inv.amountPaidNow ?? inv.netAmount;
          const split = cashOnlineSplit(inv.paymentMode, inv.cashAmount, inv.onlineAmount, paidNow);
          cashPaid += split.cash;
          onlinePaid += split.online;
        }
        return {
          customer: c.name,
          phone: (c.phones ?? [])[0] ?? "",
          invoiceCount: invoices.length,
          invoicedThisPeriod,
          paidThisPeriod,
          cashPaid: round2(cashPaid),
          onlinePaid: round2(onlinePaid),
          dueThisPeriod: Math.max(0, rawDue),
          creditThisPeriod: Math.max(0, -rawDue),
        };
      })
    );
    const nonZero = rows.filter((r) => r.invoiceCount > 0);
    const totals = {
      invoicedThisPeriod: round2(nonZero.reduce((s, r) => s + r.invoicedThisPeriod, 0)),
      paidThisPeriod: round2(nonZero.reduce((s, r) => s + r.paidThisPeriod, 0)),
      cashPaid: round2(nonZero.reduce((s, r) => s + r.cashPaid, 0)),
      onlinePaid: round2(nonZero.reduce((s, r) => s + r.onlinePaid, 0)),
      dueThisPeriod: round2(nonZero.reduce((s, r) => s + r.dueThisPeriod, 0)),
      creditThisPeriod: round2(nonZero.reduce((s, r) => s + r.creditThisPeriod, 0)),
    };
    return {
      reportKey: "customers",
      titleKey: "reports.title.customers",
      columns: [
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "phone", labelKey: "reports.col.phone", format: "text" },
        { key: "invoiceCount", labelKey: "reports.col.invoiceCount", format: "number" },
        { key: "invoicedThisPeriod", labelKey: "reports.col.invoicedThisPeriod", format: "currency" },
        { key: "paidThisPeriod", labelKey: "reports.col.paidThisPeriod", format: "currency" },
        { key: "cashPaid", labelKey: "reports.col.cashAmount", format: "currency" },
        { key: "onlinePaid", labelKey: "reports.col.onlineAmount", format: "currency" },
        { key: "dueThisPeriod", labelKey: "reports.col.dueThisPeriod", format: "currency" },
        { key: "creditThisPeriod", labelKey: "reports.col.credit", format: "currency" },
      ],
      rows: nonZero,
      totals,
    };
  },
};

const invoices: ReportDefinition = {
  key: "invoices",
  titleKey: "reports.title.invoices",
  async run(kilnId, filters) {
    // A dispatch attributed to a specific sales agent can't be told apart
    // from any other until it's actually invoiced (agentId only ever lives
    // on the Invoice row) — an agentId filter is inherently about
    // attributed invoices, so unbilled dispatches are left out rather than
    // guessed at when that filter is active.
    const [realRows, unbilledAll, kiln, categories, targetCustomer] = await Promise.all([
      listInvoices(kilnId, null, { customerId: filters.customerId, agentId: filters.agentId, from: filters.from, to: filters.to }),
      filters.agentId ? Promise.resolve([]) : unbilledDispatchRows(kilnId, { from: filters.from, to: filters.to }),
      db.select({ name: kilns.name }).from(kilns).where(eq(kilns._id, kilnId)).then((r) => r[0]),
      listBrickCategories(kilnId),
      // Only resolved when actually needed, to filter the kiln-wide
      // unbilled set down to this one customer — see belongsToCustomer.
      filters.customerId ? listCustomers(kilnId).then((cs) => cs.find((c) => c._id === filters.customerId)) : Promise.resolve(undefined),
    ]);
    const unbilled = filters.customerId ? unbilledAll.filter((d) => targetCustomer && belongsToCustomer(d, targetCustomer._id, targetCustomer.name)) : unbilledAll;
    const rows = [...realRows, ...unbilled];
    const kilnName = kiln?.name ?? "Bhatta Cloud";
    const categoryNameById = new Map(categories.map((c) => [c._id, c.category]));

    // Kiln-wide, NOT date-ranged — same reasoning as unbilledDispatchRows
    // above and brickLoading's own identical fetch: a later top-up payment
    // outside this report's own date window still has to be able to
    // settle an earlier due sitting inside it. Real invoices only (not
    // unbilledAll) — an unbilled dispatch is always its own amount=paidNow
    // by construction, so it never contributes a shortfall to resolve or
    // a credit to apply.
    const allInvoicesForFifo = await listInvoices(kilnId, null, {});
    const invoicesByCustomer = new Map<string, typeof allInvoicesForFifo>();
    for (const inv of allInvoicesForFifo) {
      const key = inv.customerId ?? `name:${inv.customerName.trim().toLowerCase()}`;
      const list = invoicesByCustomer.get(key) ?? [];
      list.push(inv);
      invoicesByCustomer.set(key, list);
    }
    const remainingDueByDispatch = new Map<string, number>();
    for (const custInvoices of invoicesByCustomer.values()) {
      const { remainingDue } = fifoResolveCustomerDues(custInvoices);
      for (const [dispatchId, due] of remainingDue) remainingDueByDispatch.set(dispatchId, due);
    }

    // Loading/unloading charges are the palledar's wage for physically
    // loading/unloading the truck — tracked on the brickLoadingEntries row
    // a dispatch may have been generated from (brickLoading.service.ts),
    // never folded into the invoice's own billed amount. Looked up here,
    // one query for every relevant trip, so the report can show the full
    // picture of a sale next to what it cost to move — exactly the
    // "billing breakdown" gap the client asked to have closed.
    const dispatchIds = [...new Set(rows.map((r) => r.dispatchId).filter((id): id is string => !!id))];
    const loadingRows = dispatchIds.length
      ? await db.select({ dispatchId: brickLoadingEntries.dispatchId, loadingCharge: brickLoadingEntries.loadingCharge, unloadingCharge: brickLoadingEntries.unloadingCharge }).from(brickLoadingEntries).where(and(eq(brickLoadingEntries.kilnId, kilnId), inArray(brickLoadingEntries.dispatchId, dispatchIds)))
      : [];
    const loadingByDispatch = new Map(loadingRows.map((r) => [r.dispatchId, r]));

    const filtered = filters.categoryId
      ? rows.filter((r) => itemsOrLegacyFallback(r).some((it) => it.categoryId === filters.categoryId))
      : rows;

    const detail = filtered.map((r) => {
      // totalBillAmount/paidNow stay as the invoice's own raw figures (a
      // 0-brick row's netAmount is literally the advance/general-payment
      // amount, same transparency the Customer profile's Invoices table
      // keeps). `due` is charge-gated like getCustomerDetail (a 0-brick
      // row has nothing billed on it, so nothing can be "due" on it) and
      // then clamped at 0 — a due can't sensibly be negative, that's a
      // credit — with whatever it would have gone negative by (an advance,
      // or a real invoice paid for more than it was billed) surfaced as
      // its own `credit` column instead. Showing a raw negative due right
      // next to a matching totalBillAmount/paidNow looked like a math
      // error (e.g. "4,000 bill, 4,000 paid, -4,000 due").
      //
      // totalBillAmount is charge-gated the same way, NOT the invoice's
      // raw netAmount — a 0-brick advance row has nothing billed on it (see
      // `charge` above), so showing its netAmount here double-counted the
      // same rupees as both a "bill" and (correctly) a `credit`, and
      // inflated this report's own Bill-amount total above every other
      // report's for the identical underlying data (confirmed against real
      // production data: this column's total ran ₹66,700 over the
      // Customers report's own "Invoiced" total — exactly the sum of every
      // 0-brick advance invoice's netAmount). The Customer profile page's
      // own Invoices table already gates this the same way (see
      // CustomerDetailPage.tsx's `charge`) — this brings the Reports-page
      // version back in line with it.
      const charge = r.bricksCount > 0 ? r.netAmount : 0;
      const paidNow = r.amountPaidNow ?? r.netAmount;
      const rawDue = round2(charge - paidNow);
      const items = itemsOrLegacyFallback(r);
      const category = [...new Set(items.map((it) => (it.categoryId ? categoryNameById.get(it.categoryId) ?? it.categoryId : null)).filter((v): v is string => !!v))].join(", ");
      const loading = r.dispatchId ? loadingByDispatch.get(r.dispatchId) : undefined;
      // A later, separate top-up payment against this exact invoice may
      // have already settled some or all of rawDue (see
      // fifoResolveCustomerDues in types.ts) — resolved due reads lower
      // (often 0) than the raw shortfall in that case. Only real,
      // dispatch-linked invoices are in remainingDueByDispatch (it's built
      // from allInvoicesForFifo, real invoices only); a 0-brick advance
      // row's own credit is untouched by this — it's a genuine payment
      // fact on its own date, not double-counted just because the money
      // went on to settle an earlier invoice's due.
      const due = r.dispatchId ? (remainingDueByDispatch.get(r.dispatchId) ?? Math.max(0, rawDue)) : Math.max(0, rawDue);
      return {
        date: r.invoiceDate ? r.invoiceDate.toISOString() : null,
        serial: "_synthetic" in r ? "Not Invoiced" : formatInvoiceNumber(r, kilnName),
        customer: r.customerName.trim(),
        category: category || "—",
        bricksCount: r.bricksCount,
        totalBillAmount: charge,
        paidNow,
        due: round2(due),
        credit: Math.max(0, -rawDue),
        loadingCharge: loading?.loadingCharge ?? 0,
        unloadingCharge: loading?.unloadingCharge ?? 0,
      };
    });

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["totalBillAmount", "paidNow", "due", "credit", "loadingCharge", "unloadingCharge"], filters.groupBy);
      return {
        reportKey: "invoices",
        titleKey: "reports.title.invoices",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "totalBillAmount", labelKey: "reports.col.totalBillAmount", format: "currency" },
          { key: "paidNow", labelKey: "reports.col.paidThisPeriod", format: "currency" },
          { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
          { key: "credit", labelKey: "reports.col.credit", format: "currency" },
          { key: "loadingCharge", labelKey: "reports.col.loadingCharge", format: "currency" },
          { key: "unloadingCharge", labelKey: "reports.col.unloadingCharge", format: "currency" },
        ],
        rows: grouped,
        totals: {
          totalBillAmount: round2(grouped.reduce((s, r) => s + (r.totalBillAmount as number), 0)),
          paidNow: round2(grouped.reduce((s, r) => s + (r.paidNow as number), 0)),
          due: round2(grouped.reduce((s, r) => s + (r.due as number), 0)),
          credit: round2(grouped.reduce((s, r) => s + (r.credit as number), 0)),
          loadingCharge: round2(grouped.reduce((s, r) => s + (r.loadingCharge as number), 0)),
          unloadingCharge: round2(grouped.reduce((s, r) => s + (r.unloadingCharge as number), 0)),
        },
      };
    }

    return {
      reportKey: "invoices",
      titleKey: "reports.title.invoices",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "serial", labelKey: "reports.col.serial", format: "text" },
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "category", labelKey: "reports.col.category", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "totalBillAmount", labelKey: "reports.col.totalBillAmount", format: "currency" },
        { key: "paidNow", labelKey: "reports.col.paidThisPeriod", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "credit", labelKey: "reports.col.credit", format: "currency" },
        { key: "loadingCharge", labelKey: "reports.col.loadingCharge", format: "currency" },
        { key: "unloadingCharge", labelKey: "reports.col.unloadingCharge", format: "currency" },
      ],
      rows: detail,
      totals: {
        totalBillAmount: round2(detail.reduce((s, r) => s + r.totalBillAmount, 0)),
        paidNow: round2(detail.reduce((s, r) => s + r.paidNow, 0)),
        due: round2(detail.reduce((s, r) => s + r.due, 0)),
        credit: round2(detail.reduce((s, r) => s + r.credit, 0)),
        loadingCharge: round2(detail.reduce((s, r) => s + r.loadingCharge, 0)),
        unloadingCharge: round2(detail.reduce((s, r) => s + r.unloadingCharge, 0)),
      },
    };
  },
};

// One row per (customer, brick category) — the exact "which customer
// bought how many bricks from which category" breakdown the client
// asked for, which no report showed anywhere before this: the Customers
// report rolls every category together per customer, and
// itemWiseAvgSaleRate rolls every customer together per category.
// Sourced from every invoice kiln-wide (not per-customer, so a sale
// that never got linked to a real Customer record — see
// listInvoicesForCustomer's own fallback — still shows up, grouped by
// its raw customerName text, the same "name key" convention
// salesAgent.service.ts's customersFromInvoices already uses), expanded
// per line item for multi-category invoices. paid/due are allocated
// across an invoice's line items proportionally to each item's own
// share of the invoice's billed amount — invoices don't track payment
// per line item, so this is the closest defensible per-category split
// of a real, single invoice-level payment.
const salesByCustomerCategory: ReportDefinition = {
  key: "salesByCustomerCategory",
  titleKey: "reports.title.salesByCustomerCategory",
  async run(kilnId, filters) {
    const [realRows, unbilledAll, categories, targetCustomer] = await Promise.all([
      listInvoices(kilnId, null, { customerId: filters.customerId, from: filters.from, to: filters.to }),
      unbilledDispatchRows(kilnId, { from: filters.from, to: filters.to }),
      listBrickCategories(kilnId),
      filters.customerId ? listCustomers(kilnId).then((cs) => cs.find((c) => c._id === filters.customerId)) : Promise.resolve(undefined),
    ]);
    const unbilled = filters.customerId ? unbilledAll.filter((d) => targetCustomer && belongsToCustomer(d, targetCustomer._id, targetCustomer.name)) : unbilledAll;
    const rows = [...realRows, ...unbilled];
    const categoryNameById = new Map(categories.map((c) => [c._id, c.category]));
    // An unbilled dispatch's own customerId is usually null (see
    // unbilledDispatchRows) even when its customerName matches a real
    // tracked Customer who ALSO has real, customerId-linked invoices —
    // without resolving that name back to the tracked customer's id here,
    // the two would fragment into separate "customer" rows below for the
    // same actual person (one keyed by the real id, one by a raw name:
    // key), splitting their bricks/amount across two buckets instead of
    // one. Built once, all customers, not just filters.customerId — a
    // kiln-wide report has to resolve every customer's name, not just one.
    const customerIdByName = new Map((await listCustomers(kilnId)).map((c) => [c.name.trim().toLowerCase(), c._id]));

    interface Bucket {
      customerName: string;
      categoryId: string;
      bricksCount: number;
      amount: number;
      paid: number;
      due: number; // signed running total; clamped to due/credit only when read out below
    }
    const byKey = new Map<string, Bucket>();

    for (const inv of rows) {
      if (inv.bricksCount <= 0) continue; // 0-brick advance/general-payment rows aren't a brick sale
      // itemsOrLegacyFallback's per-field names (pricePerBrick/amount) are
      // its OWN generic convention, not an Invoice row's actual column
      // names (ratePerBrick, and no top-level `amount` at all — only
      // netAmount) — calling it directly on `inv` silently read undefined
      // for both on any invoice with no `items` array (single-category,
      // pre-multi-category-support legacy rows), so its synthesized
      // fallback item always priced out at ₹0. That zeroed itemAmounts[i]
      // for every item on the invoice, so `share` below divided 0 by
      // (itemAmounts.reduce(...) || netAmount) and still came out 0 —
      // the netAmount fallback fixed the DENOMINATOR but not the
      // NUMERATOR, so the invoice's real billed amount silently
      // vanished from this report while its own bricksCount (added
      // unconditionally below) still counted normally. Confirmed against
      // real production data: one legacy single-category invoice's full
      // ₹81,200 was missing from its customer/category bucket while its
      // 14,000 bricks were present, undercounting this report's own total
      // against every other report's by exactly that amount. Mapping the
      // real column names in explicitly fixes it.
      const items = itemsOrLegacyFallback({ items: inv.items, categoryId: inv.categoryId, bricksCount: inv.bricksCount, pricePerBrick: inv.ratePerBrick, amount: inv.netAmount }).filter(
        (it) => it.categoryId && (!filters.categoryId || it.categoryId === filters.categoryId)
      );
      if (items.length === 0) continue;

      // Each item's raw amount (bricksCount x its own price) never reflects
      // an invoice-level discountAmount — only inv.netAmount does. Share is
      // computed off the raw amounts (their ratio to each other is the
      // same either way), but every rupee figure actually recorded per
      // category is that share applied to netAmount, so category amounts
      // always sum to exactly what the invoice was really billed for —
      // otherwise a discounted, fully-paid invoice would misreport its
      // pre-discount slice as still due.
      const itemAmounts = items.map((it) => it.amount ?? (it.pricePerBrick != null ? round2(it.bricksCount * it.pricePerBrick) : 0));
      const totalItemsAmount = itemAmounts.reduce((s, a) => s + a, 0) || inv.netAmount;
      const paidNow = inv.amountPaidNow ?? inv.netAmount;
      const customerKey = inv.customerId ?? customerIdByName.get(inv.customerName.trim().toLowerCase()) ?? `name:${inv.customerName.trim().toLowerCase()}`;

      items.forEach((it, i) => {
        const share = totalItemsAmount > 0 ? itemAmounts[i] / totalItemsAmount : 0;
        const billedShare = round2(inv.netAmount * share);
        const paidShare = round2(paidNow * share);
        const key = `${customerKey}::${it.categoryId}`;
        const bucket = byKey.get(key) ?? { customerName: inv.customerName.trim(), categoryId: it.categoryId!, bricksCount: 0, amount: 0, paid: 0, due: 0 };
        bucket.bricksCount += it.bricksCount;
        bucket.amount = round2(bucket.amount + billedShare);
        bucket.paid = round2(bucket.paid + paidShare);
        bucket.due = round2(bucket.due + (billedShare - paidShare));
        byKey.set(key, bucket);
      });
    }

    // due is clamped at 0 here (a due can't sensibly be negative — that's
    // a credit, e.g. a category over-paid relative to its own allocated
    // share) with the excess broken out as its own `credit` column,
    // same reasoning as the invoices/customers reports above.
    const detail = [...byKey.values()]
      .map((b) => ({
        customer: b.customerName,
        category: categoryNameById.get(b.categoryId) ?? b.categoryId,
        bricksCount: b.bricksCount,
        amount: b.amount,
        paid: b.paid,
        due: Math.max(0, round2(b.due)),
        credit: Math.max(0, round2(-b.due)),
      }))
      .sort((a, b) => a.customer.localeCompare(b.customer) || a.category.localeCompare(b.category));

    return {
      reportKey: "salesByCustomerCategory",
      titleKey: "reports.title.salesByCustomerCategory",
      columns: [
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "category", labelKey: "reports.col.category", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "amount", labelKey: "reports.col.totalBillAmount", format: "currency" },
        { key: "paid", labelKey: "reports.col.paidThisPeriod", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "credit", labelKey: "reports.col.credit", format: "currency" },
      ],
      rows: detail,
      totals: {
        bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0),
        amount: round2(detail.reduce((s, r) => s + r.amount, 0)),
        paid: round2(detail.reduce((s, r) => s + r.paid, 0)),
        due: round2(detail.reduce((s, r) => s + r.due, 0)),
        credit: round2(detail.reduce((s, r) => s + r.credit, 0)),
      },
    };
  },
};

const gatePasses: ReportDefinition = {
  key: "gatePasses",
  titleKey: "reports.title.gatePasses",
  async run(kilnId, filters) {
    const rows = await listGatePasses(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.gatePassDate ? r.gatePassDate.toISOString() : null,
      serial: r.sequenceNumber != null ? `GP-${r.sequenceNumber}` : "",
      customer: r.customerName,
      vehicleNumber: r.vehicleNumber ?? "",
      vehicleType: r.vehicleType ?? "",
      bricksCount: r.bricksCount,
    }));
    const rowsOut = filters.groupBy && filters.groupBy !== "none" ? groupRowsByPeriod(detail, "date", ["bricksCount"], filters.groupBy) : detail;
    const columns =
      filters.groupBy && filters.groupBy !== "none"
        ? [
            { key: "period", labelKey: "reports.col.period", format: "text" as const },
            { key: "count", labelKey: "reports.col.entries", format: "number" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ]
        : [
            { key: "date", labelKey: "reports.col.date", format: "date" as const },
            { key: "serial", labelKey: "reports.col.serial", format: "text" as const },
            { key: "customer", labelKey: "reports.col.customer", format: "text" as const },
            { key: "vehicleNumber", labelKey: "reports.col.vehicleNumber", format: "text" as const },
            { key: "vehicleType", labelKey: "reports.col.vehicleType", format: "text" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ];
    return {
      reportKey: "gatePasses",
      titleKey: "reports.title.gatePasses",
      columns,
      rows: rowsOut,
      totals: { bricksCount: round2(detail.reduce((s, r) => s + r.bricksCount, 0)) },
    };
  },
};

const challans: ReportDefinition = {
  key: "challans",
  titleKey: "reports.title.challans",
  async run(kilnId, filters) {
    const rows = await listChallans(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.challanDate ? r.challanDate.toISOString() : null,
      serial: r.sequenceNumber != null ? `CH-${r.sequenceNumber}` : "",
      customer: r.customerName,
      vehicleNumber: r.vehicleNumber ?? "",
      vehicleType: r.vehicleType ?? "",
      bricksCount: r.bricksCount,
    }));
    const rowsOut = filters.groupBy && filters.groupBy !== "none" ? groupRowsByPeriod(detail, "date", ["bricksCount"], filters.groupBy) : detail;
    const columns =
      filters.groupBy && filters.groupBy !== "none"
        ? [
            { key: "period", labelKey: "reports.col.period", format: "text" as const },
            { key: "count", labelKey: "reports.col.entries", format: "number" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ]
        : [
            { key: "date", labelKey: "reports.col.date", format: "date" as const },
            { key: "serial", labelKey: "reports.col.serial", format: "text" as const },
            { key: "customer", labelKey: "reports.col.customer", format: "text" as const },
            { key: "vehicleNumber", labelKey: "reports.col.vehicleNumber", format: "text" as const },
            { key: "vehicleType", labelKey: "reports.col.vehicleType", format: "text" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ];
    return {
      reportKey: "challans",
      titleKey: "reports.title.challans",
      columns,
      rows: rowsOut,
      totals: { bricksCount: round2(detail.reduce((s, r) => s + r.bricksCount, 0)) },
    };
  },
};

const expenses: ReportDefinition = {
  key: "expenses",
  titleKey: "reports.title.expenses",
  async run(kilnId, filters) {
    const [allRows, types] = await Promise.all([
      listExpenses(kilnId, null, { from: filters.from, to: filters.to }),
      listExpenseTypes(kilnId),
    ]);
    // filters.category is matched against BOTH the modern admin-extensible
    // expenseTypeId and the legacy fixed category enum, since a given
    // expense row is classified by exactly one of the two (see the schema
    // comment on expenses.category) — this lets the frontend's category
    // picker offer the modern expense-type list without missing older rows.
    const rows = filters.category ? allRows.filter((r) => r.expenseTypeId === filters.category || r.category === filters.category) : allRows;
    const typeById = new Map(types.map((t) => [t._id, t.name]));
    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      type: r.expenseTypeId ? typeById.get(r.expenseTypeId) ?? "" : r.category ?? "",
      amount: r.amount,
      paymentMode: r.paymentMode ?? "",
      notes: r.notes ?? "",
    }));

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["amount"], filters.groupBy);
      return {
        reportKey: "expenses",
        titleKey: "reports.title.expenses",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        ],
        rows: grouped,
        totals: { amount: round2(grouped.reduce((s, r) => s + (r.amount as number), 0)) },
      };
    }

    return {
      reportKey: "expenses",
      titleKey: "reports.title.expenses",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "type", labelKey: "reports.col.expenseType", format: "text" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        { key: "paymentMode", labelKey: "reports.col.paymentMode", format: "text" },
        { key: "notes", labelKey: "reports.col.notes", format: "text" },
      ],
      rows: detail,
      totals: { amount: round2(detail.reduce((s, r) => s + r.amount, 0)) },
    };
  },
};

export const tradeReports: ReportDefinition[] = [customers, invoices, salesByCustomerCategory, gatePasses, challans, expenses];
