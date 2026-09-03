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
import { listGherCycleCrossChecks } from "../gherCycle.service";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, refName, round2 } from "./types";

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
      totals: { bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0), wage: round2(detail.reduce((s, r) => s + r.wage, 0)) },
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
      totals: { bonusAmount: round2(detail.reduce((s, r) => s + r.bonusAmount, 0)) },
    };
  },
};

const nikasi: ReportDefinition = {
  key: "nikasi",
  titleKey: "reports.title.nikasi",
  async run(kilnId, filters) {
    const rows = await listNikasiEntries(kilnId, null, { gangId: filters.personId, from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      gang: refName(r.gangId),
      gher: typeof r.gherId === "object" && r.gherId ? String((r.gherId as { number?: number }).number ?? "") : String(r.gherId ?? ""),
      bricksCount: r.bricksCount,
      damagedCount: r.damagedCount ?? 0,
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

const brickLoading: ReportDefinition = {
  key: "brickLoading",
  titleKey: "reports.title.brickLoading",
  async run(kilnId, filters) {
    const rows = await listBrickLoadingEntries(kilnId, null, { driverId: filters.driverId, from: filters.from, to: filters.to });
    // cashAmount/onlineAmount for the CUSTOMER's own brick payment are
    // never stored on brickLoadingEntries itself — only on whichever
    // Dispatch this trip is linked to (see listBrickLoadingEntries'
    // dispatchId resolution). A trip with no linked dispatch yet has no
    // payment recorded at all, so both read as null (shown as "—") rather
    // than a misleading 0.
    const detail = rows.map((r) => {
      const dispatch = r.dispatchId && typeof r.dispatchId === "object" ? r.dispatchId : null;
      return {
        date: r.date ? r.date.toISOString() : null,
        tripNumber: r.tripNumber ?? "",
        customer: r.customerName ?? "",
        driver: refName(r.driverId) ?? r.driverName ?? "",
        vehicleNumber: r.vehicleNumber,
        bricksCount: r.bricksCount,
        amount: r.amount ?? 0,
        cashAmount: dispatch?.cashAmount ?? null,
        onlineAmount: dispatch?.onlineAmount ?? null,
        tipAmount: r.tipAmount ?? 0,
      };
    });
    const { rows: outRows, columns } = groupedOrDetail(
      filters.groupBy,
      detail,
      ["bricksCount", "amount", "cashAmount", "onlineAmount", "tipAmount"],
      [
        { key: "period", labelKey: "reports.col.period", format: "text" },
        { key: "count", labelKey: "reports.col.entries", format: "number" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        { key: "cashAmount", labelKey: "reports.col.cashAmount", format: "currency" },
        { key: "onlineAmount", labelKey: "reports.col.onlineAmount", format: "currency" },
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
