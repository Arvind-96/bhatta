import { listLedgerForKiln } from "../ledger.service";
import { listSalarySlipsForKiln } from "../salary.service";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, refName, round2 } from "./types";
import { PersonType } from "../person.service";

// Labour / Contractor / Staff Ledger & Work — the direct kharchi-example
// data source. personType filters to one PERSON_TYPES value (bulk-by-
// category, e.g. every WORKER); personId narrows to one individual. Every
// ledger entry (advance/kharchi/medical/festival/wage/salary/...) is a
// row; groupBy collapses them into day/week/month/quarter/year buckets
// with a running due/paid/net total, matching the 7-day kharchi cycle
// example exactly.
const labourLedger: ReportDefinition = {
  key: "labourLedger",
  titleKey: "reports.title.labourLedger",
  async run(kilnId, filters) {
    const rows = await listLedgerForKiln(kilnId, {
      personId: filters.personId,
      personType: filters.personType as PersonType | undefined,
      from: filters.from,
      to: filters.to,
    });

    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      person: refName(r.personId),
      category: r.category ?? "",
      direction: r.direction,
      dueAmount: r.direction === "DUE" ? r.amount : 0,
      paidAmount: r.direction === "PAID" ? r.amount : 0,
      reason: r.reason,
    }));

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["dueAmount", "paidAmount"], filters.groupBy);
      const groupedRows = grouped.map((g) => ({
        period: g.period,
        entries: g.count,
        dueAmount: round2(g.dueAmount as number),
        paidAmount: round2(g.paidAmount as number),
        netAmount: round2((g.dueAmount as number) - (g.paidAmount as number)),
      }));
      const totals = {
        dueAmount: round2(groupedRows.reduce((s, r) => s + r.dueAmount, 0)),
        paidAmount: round2(groupedRows.reduce((s, r) => s + r.paidAmount, 0)),
        netAmount: round2(groupedRows.reduce((s, r) => s + r.netAmount, 0)),
      };
      return {
        reportKey: "labourLedger",
        titleKey: "reports.title.labourLedger",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "entries", labelKey: "reports.col.entries", format: "number" },
          { key: "dueAmount", labelKey: "reports.col.dueAmount", format: "currency" },
          { key: "paidAmount", labelKey: "reports.col.paidAmount", format: "currency" },
          { key: "netAmount", labelKey: "reports.col.netAmount", format: "currency" },
        ],
        rows: groupedRows,
        totals,
      };
    }

    const totals = {
      dueAmount: round2(detail.reduce((s, r) => s + r.dueAmount, 0)),
      paidAmount: round2(detail.reduce((s, r) => s + r.paidAmount, 0)),
      netAmount: round2(detail.reduce((s, r) => s + (r.dueAmount - r.paidAmount), 0)),
    };
    return {
      reportKey: "labourLedger",
      titleKey: "reports.title.labourLedger",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "person", labelKey: "reports.col.person", format: "text" },
        { key: "category", labelKey: "reports.col.category", format: "text" },
        { key: "direction", labelKey: "reports.col.direction", format: "text" },
        { key: "dueAmount", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "paidAmount", labelKey: "reports.col.paidAmount", format: "currency" },
        { key: "reason", labelKey: "reports.col.reason", format: "text" },
      ],
      rows: detail,
      totals,
    };
  },
};

const salary: ReportDefinition = {
  key: "salary",
  titleKey: "reports.title.salary",
  async run(kilnId, filters) {
    const rows = await listSalarySlipsForKiln(kilnId, { personId: filters.personId, from: filters.from, to: filters.to });
    const detail = rows.map((r) => {
      const person = r.personId as { name?: string; designation?: string | null; type?: string } | string;
      const designation = typeof person === "object" ? person.designation ?? person.type ?? "" : "";
      return {
        month: r.month,
        person: refName(r.personId),
        designation,
        grossSalary: r.grossSalary,
        deductions: r.deductions,
        netSalary: r.netSalary,
        daysPresent: r.daysPresent,
        daysAbsent: r.daysAbsent,
      };
    });
    const totals = {
      grossSalary: round2(detail.reduce((s, r) => s + r.grossSalary, 0)),
      deductions: round2(detail.reduce((s, r) => s + r.deductions, 0)),
      netSalary: round2(detail.reduce((s, r) => s + r.netSalary, 0)),
    };
    return {
      reportKey: "salary",
      titleKey: "reports.title.salary",
      columns: [
        { key: "month", labelKey: "reports.col.month", format: "text" },
        { key: "person", labelKey: "reports.col.person", format: "text" },
        { key: "designation", labelKey: "reports.col.designation", format: "text" },
        { key: "grossSalary", labelKey: "reports.col.grossSalary", format: "currency" },
        { key: "deductions", labelKey: "reports.col.deductions", format: "currency" },
        { key: "netSalary", labelKey: "reports.col.netSalary", format: "currency" },
        { key: "daysPresent", labelKey: "reports.col.daysPresent", format: "number" },
        { key: "daysAbsent", labelKey: "reports.col.daysAbsent", format: "number" },
      ],
      rows: detail,
      totals,
    };
  },
};

export const peopleReports: ReportDefinition[] = [labourLedger, salary];
