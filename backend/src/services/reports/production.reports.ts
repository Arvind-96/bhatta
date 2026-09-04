import { inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { people } from "../../db/schema";
import { listSoilTrips } from "../soilTrip.service";
import { listSandDeliveries } from "../sandDelivery.service";
import { listMoldingEntries } from "../molding.service";
import { listStackingEntries } from "../stacking.service";
import { listFiringShifts } from "../firingShift.service";
import { listNikasiEntries } from "../nikasi.service";
import { listBrickLoadingEntries } from "../brickLoading.service";
import { listInvoices } from "../dispatchDocuments.service";
import { listGherCycleCrossChecks } from "../gherCycle.service";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, cashOnlineSplit, refName, round2, fifoResolveCustomerDues, type FifoInvoiceRow } from "./types";

function groupedOrDetail<T extends Record<string, unknown>>(
  groupBy: string | undefined,
  detail: T[],
  sumFields: (keyof T)[],
  groupedColumns: { key: string; labelKey: string; format: "date" | "currency" | "number" | "text" }[],
  detailColumns: { key: string; labelKey: string; format: "date" | "currency" | "number" | "text" }[]
) {
  if (groupBy && groupBy !== "none") {
    const grouped = groupRowsByPeriod(detail, "date" as keyof T, sumFields, groupBy as never);
    return { rows: grouped, columns: groupedColumns };
  }
  return { rows: detail, columns: detailColumns };
}

const soil: ReportDefinition = {
  key: "soil",
  titleKey: "reports.title.soil",
  async run(kilnId, filters) {
    const rows = await listSoilTrips(kilnId, null, { landownerId: filters.personId, from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      landowner: refName(r.landownerId),
      driver: refName(r.driverId),
      trolleyCount: r.trolleyCount ?? 0,
      amount: round2((r.trolleyCount ?? 0) * r.ratePerTrolley),
    }));
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["trolleyCount", "amount"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "trolleyCount", labelKey: "reports.col.trolleyCount", format: "number" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "landowner", labelKey: "reports.col.landowner", format: "text" },
        { key: "driver", labelKey: "reports.col.driver", format: "text" },
        { key: "trolleyCount", labelKey: "reports.col.trolleyCount", format: "number" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
      ]
    );
    return {
      reportKey: "soil",
      titleKey: "reports.title.soil",
      columns,
      rows: outRows,
      totals: { amount: round2(detail.reduce((s, r) => s + r.amount, 0)), trolleyCount: detail.reduce((s, r) => s + r.trolleyCount, 0) },
    };
  },
};

const sand: ReportDefinition = {
  key: "sand",
  titleKey: "reports.title.sand",
  async run(kilnId, filters) {
    const rows = await listSandDeliveries(kilnId, null, { sandContractorId: filters.personId, from: filters.from, to: filters.to });
    const contractorIds = [...new Set(rows.map((r) => r.sandContractorId))];
    const contractorRows = contractorIds.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, contractorIds)) : [];
    const nameById = new Map(contractorRows.map((c) => [c._id, c.name]));

    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      contractor: nameById.get(r.sandContractorId) ?? r.sandContractorId,
      trolleyCount: r.trolleyCount,
      paymentGiven: r.paymentGiven ?? 0,
      paymentPending: r.paymentPending ?? 0,
    }));
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["trolleyCount", "paymentGiven", "paymentPending"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "trolleyCount", labelKey: "reports.col.trolleyCount", format: "number" },
        { key: "paymentGiven", labelKey: "reports.col.paymentGiven", format: "currency" },
        { key: "paymentPending", labelKey: "reports.col.paymentPending", format: "currency" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "contractor", labelKey: "reports.col.contractor", format: "text" },
        { key: "trolleyCount", labelKey: "reports.col.trolleyCount", format: "number" },
        { key: "paymentGiven", labelKey: "reports.col.paymentGiven", format: "currency" },
        { key: "paymentPending", labelKey: "reports.col.paymentPending", format: "currency" },
      ]
    );
    return {
      reportKey: "sand",
      titleKey: "reports.title.sand",
      columns,
      rows: outRows,
      totals: {
        paymentGiven: round2(detail.reduce((s, r) => s + r.paymentGiven, 0)),
        paymentPending: round2(detail.reduce((s, r) => s + r.paymentPending, 0)),
      },
    };
  },
};

const molding: ReportDefinition = {
  key: "molding",
  titleKey: "reports.title.molding",
  async run(kilnId, filters) {
    const rows = await listMoldingEntries(kilnId, null, { workerId: filters.personId, from: filters.from, to: filters.to });
    const detail = rows
      .filter((r) => !filters.damageFault || r.damageFault === filters.damageFault)
      .map((r) => ({
        date: r.date ? r.date.toISOString() : null,
        worker: refName(r.workerId),
        bricksCount: r.bricksCount,
        damagedCount: r.damagedCount ?? 0,
        damageFault: r.damageFault ?? "",
        wage: round2(r.washedOut ? 0 : (r.bricksCount / 1000) * r.ratePerThousand),
      }));
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["bricksCount", "damagedCount", "wage"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damagedCount", labelKey: "reports.col.damagedCount", format: "number" },
        { key: "wage", labelKey: "reports.col.wage", format: "currency" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "worker", labelKey: "reports.col.worker", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damagedCount", labelKey: "reports.col.damagedCount", format: "number" },
        { key: "damageFault", labelKey: "reports.col.damageFault", format: "text" },
        { key: "wage", labelKey: "reports.col.wage", format: "currency" },
      ]
    );
    return {
      reportKey: "molding",
      titleKey: "reports.title.molding",
      columns,
      rows: outRows,
      totals: {
        bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0),
        damagedCount: detail.reduce((s, r) => s + r.damagedCount, 0),
        wage: round2(detail.reduce((s, r) => s + r.wage, 0)),
      },
    };
  },
};

const stacking: ReportDefinition = {
  key: "stacking",
  titleKey: "reports.title.stacking",
  async run(kilnId, filters) {
    const rows = await listStackingEntries(kilnId, null, { gangId: filters.personId, from: filters.from, to: filters.to });
    const detail = rows
      .filter((r) => !filters.damageFault || r.damageFault === filters.damageFault)
      .map((r) => ({
        date: r.date ? r.date.toISOString() : null,
        gang: refName(r.gangId),
        gher: typeof r.gherId === "object" && r.gherId ? String((r.gherId as { number?: number }).number ?? "") : String(r.gherId ?? ""),
        stage: r.stage ?? "",
        bricksCount: r.bricksCount,
        damageCount: r.damageCount ?? 0,
        damageFault: r.damageFault ?? "",
      }));
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["bricksCount", "damageCount"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damageCount", labelKey: "reports.col.damagedCount", format: "number" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "gang", labelKey: "reports.col.gang", format: "text" },
        { key: "gher", labelKey: "reports.col.gher", format: "text" },
        { key: "stage", labelKey: "reports.col.stage", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damageCount", labelKey: "reports.col.damagedCount", format: "number" },
      ]
    );
    return {
      reportKey: "stacking",
      titleKey: "reports.title.stacking",
      columns,
      rows: outRows,
      totals: { bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0), damageCount: detail.reduce((s, r) => s + r.damageCount, 0) },
    };
  },
};

const firing: ReportDefinition = {
  key: "firing",
  titleKey: "reports.title.firing",
  async run(kilnId, filters) {
    const rows = await listFiringShifts(kilnId, null, { fitterId: filters.personId, from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      fitter: refName(r.fitterId),
      gher: typeof r.gherId === "object" && r.gherId ? String((r.gherId as { number?: number }).number ?? "") : String(r.gherId ?? ""),
      shiftType: r.shiftType,
      overtimeHours: r.overtimeHours ?? 0,
      bonusAmount: r.bonusAmount ?? 0,
    }));
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["overtimeHours", "bonusAmount"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "overtimeHours", labelKey: "reports.col.overtimeHours", format: "number" },
        { key: "bonusAmount", labelKey: "reports.col.bonusAmount", format: "currency" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "fitter", labelKey: "reports.col.fitter", format: "text" },
        { key: "gher", labelKey: "reports.col.gher", format: "text" },
        { key: "shiftType", labelKey: "reports.col.shiftType", format: "text" },
        { key: "overtimeHours", labelKey: "reports.col.overtimeHours", format: "number" },
        { key: "bonusAmount", labelKey: "reports.col.bonusAmount", format: "currency" },
      ]
    );
    return {
      reportKey: "firing",
      titleKey: "reports.title.firing",
      columns,
      rows: outRows,
      totals: {
        overtimeHours: round2(detail.reduce((s, r) => s + r.overtimeHours, 0)),
        bonusAmount: round2(detail.reduce((s, r) => s + r.bonusAmount, 0)),
      },
    };
  },
};

const nikasi: ReportDefinition = {
  key: "nikasi",
  titleKey: "reports.title.nikasi",
  async run(kilnId, filters) {
    const rows = await listNikasiEntries(kilnId, null, { gangId: filters.personId, from: filters.from, to: filters.to });
    // Bug fix: this report exposed a "Fault" filter in the UI
    // (reportDefinitions.ts) but never applied it — picking a fault value
    // silently returned every row unfiltered, unlike the molding/stacking
    // reports right next to it, which do filter on damageFault. Mirrors
    // their exact pattern.
    const detail = rows
      .filter((r) => !filters.damageFault || r.damageFault === filters.damageFault)
      .map((r) => ({
        date: r.date ? r.date.toISOString() : null,
        gang: refName(r.gangId),
        gher: typeof r.gherId === "object" && r.gherId ? String((r.gherId as { number?: number }).number ?? "") : String(r.gherId ?? ""),
        bricksCount: r.bricksCount,
        damagedCount: r.damagedCount ?? 0,
        damageFault: r.damageFault ?? "",
      }));
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["bricksCount", "damagedCount"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damagedCount", labelKey: "reports.col.damagedCount", format: "number" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "gang", labelKey: "reports.col.gang", format: "text" },
        { key: "gher", labelKey: "reports.col.gher", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damagedCount", labelKey: "reports.col.damagedCount", format: "number" },
        { key: "damageFault", labelKey: "reports.col.damageFault", format: "text" },
      ]
    );
    return {
      reportKey: "nikasi",
      titleKey: "reports.title.nikasi",
      columns,
      rows: outRows,
      totals: { bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0), damagedCount: detail.reduce((s, r) => s + r.damagedCount, 0) },
    };
  },
};

// paymentMode/cashAmount/onlineAmount on a Dispatch follow the same
// convention financialOverview.service.ts's splitByPaymentMode reads:
// cashAmount/onlineAmount are ONLY populated when paymentMode is
// CASH_AND_ONLINE — a plain CASH dispatch has them both null even though
// 100% of it was cash. Reading the raw fields directly (as this report
// used to) would misreport every single-mode dispatch as "no payment
// recorded" instead of fully cash or fully online. Delegates the actual
// CASH_AND_ONLINE split to the shared cashOnlineSplit (see types.ts) —
// this used to return the row's raw cashAmount/onlineAmount unscaled,
// which silently over-reported when `amount` was less than
// cashAmount+onlineAmount (a partially-paid invoice whose cash/online
// split was entered against the FULL bill, not just what's actually been
// collected so far) — e.g. a ₹1,29,500 sale with only ₹1,25,500 paid but
// cashAmount/onlineAmount recorded as 69,500/60,000 (summing to the full
// 1,29,500) showed cash+online summing to the FULL amount while ALSO
// separately claiming ₹4,000 due, double-counting that ₹4,000.
function effectiveSplit(paymentMode: string | null | undefined, cashAmount: number | null | undefined, onlineAmount: number | null | undefined, amount: number) {
  if (!paymentMode) return { cash: null as number | null, online: null as number | null };
  return cashOnlineSplit(paymentMode, cashAmount, onlineAmount, amount);
}

const brickLoading: ReportDefinition = {
  key: "brickLoading",
  titleKey: "reports.title.brickLoading",
  async run(kilnId, filters) {
    const [rows, allInvoices] = await Promise.all([
      listBrickLoadingEntries(kilnId, null, { driverId: filters.driverId, from: filters.from, to: filters.to }),
      // Kiln-wide, not date-filtered — a later payment outside this
      // report's own date range still has to be able to clear a due
      // inside it (see fifoResolveCustomerDues below).
      listInvoices(kilnId, null, {}),
    ]);
    const customerKey = (customerId: string | null | undefined, customerName: string) => customerId ?? `name:${customerName.trim().toLowerCase()}`;
    const invoicesByCustomer = new Map<string, FifoInvoiceRow[]>();
    for (const inv of allInvoices) {
      const key = customerKey(inv.customerId, inv.customerName);
      const list = invoicesByCustomer.get(key) ?? [];
      list.push({
        dispatchId: inv.dispatchId,
        bricksCount: inv.bricksCount,
        netAmount: inv.netAmount,
        amountPaidNow: inv.amountPaidNow,
        paymentMode: inv.paymentMode,
        cashAmount: inv.cashAmount,
        onlineAmount: inv.onlineAmount,
        invoiceDate: inv.invoiceDate,
        createdAt: inv.createdAt,
      });
      invoicesByCustomer.set(key, list);
    }
    const remainingDueByDispatch = new Map<string, number>();
    const extraCashByDispatch = new Map<string, number>();
    const extraOnlineByDispatch = new Map<string, number>();
    for (const custInvoices of invoicesByCustomer.values()) {
      const { remainingDue, extraCash, extraOnline } = fifoResolveCustomerDues(custInvoices);
      for (const [dispatchId, due] of remainingDue) remainingDueByDispatch.set(dispatchId, due);
      for (const [dispatchId, cash] of extraCash) extraCashByDispatch.set(dispatchId, cash);
      for (const [dispatchId, online] of extraOnline) extraOnlineByDispatch.set(dispatchId, online);
    }
    // The CUSTOMER's own brick payment (mode + split) is never stored on
    // brickLoadingEntries itself — only on whichever Dispatch this trip is
    // linked to (see listBrickLoadingEntries' dispatchId resolution). A
    // trip with no linked dispatch yet has no payment recorded at all, so
    // both read as null (shown as "—") rather than a misleading 0. Once a
    // dispatch IS linked, its own `amount` (net of any discount applied at
    // the dispatch stage) is shown instead of this row's own `amount` — a
    // frozen pre-discount snapshot from trip-creation time.
    //
    // A Dispatch's own paymentMode/cashAmount/onlineAmount assume the full
    // amount was paid — there's no partial-payment concept at that level.
    // But the dispatch may have a formal Invoice with its own
    // amountPaidNow < netAmount (a real "paid some now, rest due later"
    // sale — see AddCustomerPaymentModal's own note on this exact shape).
    // listBrickLoadingEntries resolves that invoice too and attaches it as
    // invoicePaidNow/invoicePaymentMode/... on the dispatch object; prefer
    // it here whenever it exists, since it's the more authoritative,
    // partial-payment-aware source. The raw shortfall (amount - paidNow)
    // is then corrected by fifoResolveCustomerDues above — a later,
    // separate top-up payment against this same customer may have already
    // settled some or all of it, in which case the resolved `due` reads
    // lower (often 0) than the raw shortfall, and that payment's own
    // cash/online contribution is folded in via extraCash/extraOnline so
    // cash+online+due still sums to the billed `amount`.
    const detail = rows.map((r) => {
      const dispatch = r.dispatchId && typeof r.dispatchId === "object" ? r.dispatchId : null;
      const amount = dispatch?.amount ?? r.amount ?? 0;
      const hasInvoice = dispatch?.invoicePaidNow != null;
      const paidNow = hasInvoice ? dispatch!.invoicePaidNow! : amount;
      const split = dispatch
        ? hasInvoice
          ? effectiveSplit(dispatch.invoicePaymentMode, dispatch.invoiceCashAmount, dispatch.invoiceOnlineAmount, paidNow)
          : effectiveSplit(dispatch.paymentMode, dispatch.cashAmount, dispatch.onlineAmount, amount)
        : { cash: null, online: null };
      const dispatchId = dispatch?._id;
      const due = dispatch ? round2(remainingDueByDispatch.get(dispatchId ?? "") ?? Math.max(0, amount - paidNow)) : null;
      const cashAmount = split.cash != null ? round2(split.cash + (extraCashByDispatch.get(dispatchId ?? "") ?? 0)) : split.cash;
      const onlineAmount = split.online != null ? round2(split.online + (extraOnlineByDispatch.get(dispatchId ?? "") ?? 0)) : split.online;
      return {
        date: r.date ? r.date.toISOString() : null,
        tripNumber: r.tripNumber ?? "",
        customer: r.customerName ?? "",
        driver: refName(r.driverId) ?? r.driverName ?? "",
        vehicleNumber: r.vehicleNumber,
        bricksCount: r.bricksCount,
        amount,
        cashAmount,
        onlineAmount,
        due,
        tipAmount: r.tipAmount ?? 0,
      };
    });
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["bricksCount", "amount", "cashAmount", "onlineAmount", "due", "tipAmount"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        { key: "cashAmount", labelKey: "reports.col.cashAmount", format: "currency" },
        { key: "onlineAmount", labelKey: "reports.col.onlineAmount", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "tipAmount", labelKey: "reports.col.tipAmount", format: "currency" },
      ],
      [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "tripNumber", labelKey: "reports.col.tripNumber", format: "text" },
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "driver", labelKey: "reports.col.driver", format: "text" },
        { key: "vehicleNumber", labelKey: "reports.col.vehicleNumber", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        { key: "cashAmount", labelKey: "reports.col.cashAmount", format: "currency" },
        { key: "onlineAmount", labelKey: "reports.col.onlineAmount", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "tipAmount", labelKey: "reports.col.tipAmount", format: "currency" },
      ]
    );
    return {
      reportKey: "brickLoading",
      titleKey: "reports.title.brickLoading",
      columns,
      rows: outRows,
      totals: {
        bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0),
        amount: round2(detail.reduce((s, r) => s + r.amount, 0)),
        cashAmount: round2(detail.reduce((s, r) => s + (r.cashAmount ?? 0), 0)),
        onlineAmount: round2(detail.reduce((s, r) => s + (r.onlineAmount ?? 0), 0)),
        due: round2(detail.reduce((s, r) => s + (r.due ?? 0), 0)),
        tipAmount: round2(detail.reduce((s, r) => s + r.tipAmount, 0)),
      },
    };
  },
};

// One row per completed (or in-progress) firing cycle — how much was
// stacked in vs. fuel spent vs. bricks unloaded vs. bricks actually graded,
// bounded to that cycle's own window (see gherCycle.service.ts's
// listGherCycleCrossChecks). The historical counterpart of the Firing
// page's live chamber board, which only ever shows the CURRENT cycle.
const nikasiCrossCheck: ReportDefinition = {
  key: "nikasiCrossCheck",
  titleKey: "reports.title.nikasiCrossCheck",
  async run(kilnId, filters) {
    const cycles = await listGherCycleCrossChecks(kilnId, null, { from: filters.from, to: filters.to });
    const detail = cycles.map((c) => ({
      gher: c.gherNumber != null ? String(c.gherNumber) : "",
      cycleNumber: c.cycle.cycleNumber,
      stackingStartedAt: c.cycle.stackingStartedAt ? c.cycle.stackingStartedAt.toISOString() : null,
      bricksStacked: c.bricksStacked,
      fuelKg: round2(c.fuel.totalKg),
      bricksUnloaded: c.bricksUnloaded,
      bricksGraded: c.bricksGraded,
      recoveryPercent: c.recoveryPercent ?? 0,
      unloadedVsGradedVariance: c.unloadedVsGradedVariance,
    }));
    return {
      reportKey: "nikasiCrossCheck",
      titleKey: "reports.title.nikasiCrossCheck",
      columns: [
        { key: "gher", labelKey: "reports.col.gher", format: "text" },
        { key: "cycleNumber", labelKey: "reports.col.cycleNumber", format: "number" },
        { key: "stackingStartedAt", labelKey: "reports.col.date", format: "date" },
        { key: "bricksStacked", labelKey: "reports.col.bricksStacked", format: "number" },
        { key: "fuelKg", labelKey: "reports.col.fuelKg", format: "number" },
        { key: "bricksUnloaded", labelKey: "reports.col.bricksUnloaded", format: "number" },
        { key: "bricksGraded", labelKey: "reports.col.bricksGraded", format: "number" },
        { key: "recoveryPercent", labelKey: "reports.col.recoveryPercent", format: "number" },
        { key: "unloadedVsGradedVariance", labelKey: "reports.col.variance", format: "number" },
      ],
      rows: detail,
    };
  },
};

// Nikasi's own damage rate as a % of what was unloaded — the "Item Wise
// Nikasi Summary With Percentage" report. Grouped by gang since Nikasi
// entries don't carry a per-brick-category breakdown (the categorized
// output only exists once a chamber is graded — see the nikasi/chamber
// grading services' own doc comments on that division of responsibility).
const nikasiItemWisePercent: ReportDefinition = {
  key: "nikasiItemWisePercent",
  titleKey: "reports.title.nikasiItemWisePercent",
  async run(kilnId, filters) {
    const rows = await listNikasiEntries(kilnId, null, { gangId: filters.personId, from: filters.from, to: filters.to });
    const byGang = new Map<string, { gang: string; bricksCount: number; damagedCount: number }>();
    for (const r of rows) {
      const name = refName(r.gangId) ?? "Unknown";
      const existing = byGang.get(name) ?? { gang: name, bricksCount: 0, damagedCount: 0 };
      existing.bricksCount += r.bricksCount;
      existing.damagedCount += r.damagedCount ?? 0;
      byGang.set(name, existing);
    }
    const detail = [...byGang.values()].map((v) => ({ ...v, damagePercent: v.bricksCount > 0 ? round2((v.damagedCount / v.bricksCount) * 100) : 0 }));
    return {
      reportKey: "nikasiItemWisePercent",
      titleKey: "reports.title.nikasiItemWisePercent",
      columns: [
        { key: "gang", labelKey: "reports.col.gang", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damagedCount", labelKey: "reports.col.damagedCount", format: "number" },
        { key: "damagePercent", labelKey: "reports.col.damagePercent", format: "number" },
      ],
      rows: detail,
      totals: { bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0), damagedCount: detail.reduce((s, r) => s + r.damagedCount, 0) },
    };
  },
};

export const productionReports: ReportDefinition[] = [soil, sand, molding, stacking, firing, nikasi, brickLoading, nikasiCrossCheck, nikasiItemWisePercent];
