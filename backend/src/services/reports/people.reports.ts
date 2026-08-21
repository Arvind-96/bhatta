import { listLedgerForKiln } from "../ledger.service";
import { listSalarySlipsForKiln } from "../salary.service";
import { listPeople, resolveContractorGang, findPeopleIds, PersonType, WorkType } from "../person.service";
import { LEDGER_CATEGORIES } from "../../db/schema";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { personProductionTotals } from "./productionTotals";
import { ReportDefinition, refName, round2 } from "./types";

type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

// Labour / Contractor / Staff Ledger & Work — the direct kharchi-example
// data source. personType filters to one PERSON_TYPES value (bulk-by-
// category, e.g. every WORKER); personId narrows to one individual;
// contractorId narrows to one contractor's entire gang (see
// resolveContractorGang); category isolates one ledger category (Advance/
// Kharchi/Medical/Festival/Fare/...). Every ledger entry is a row; groupBy
// collapses them into day/week/month/quarter/year buckets with a running
// due/paid/net total, matching the 7-day kharchi cycle example exactly.
// When scoped to exactly one person or one contractor's gang, also attaches
// a productionSummary ("every brick" alongside "every penny").
const labourLedger: ReportDefinition = {
  key: "labourLedger",
  titleKey: "reports.title.labourLedger",
  async run(kilnId, filters) {
    let personIds: string[] | undefined;
    let personType: PersonType | undefined = filters.personType as PersonType | undefined;

    if (filters.contractorId) {
      personIds = await resolveContractorGang(kilnId, filters.contractorId);
    }
    // workType/status narrow the profile pool further (e.g. "every WORKER
    // whose workType is PATHAI and who's still ACTIVE") — resolved into a
    // concrete id list here rather than inside listLedgerForKiln, so it
    // composes cleanly with the contractor-gang filter above (intersected,
    // not replaced).
    if (filters.workType || filters.status) {
      const pool = await findPeopleIds(kilnId, {
        type: personType,
        workType: filters.workType as WorkType | undefined,
        status: filters.status as "ACTIVE" | "ABSCONDED" | undefined,
      });
      const basePool = personIds ?? (filters.personId ? [filters.personId] : pool);
      personIds = personIds || filters.personId ? basePool.filter((id) => pool.includes(id)) : pool;
      personType = undefined; // already folded into the pool query above
    }

    const rows = await listLedgerForKiln(kilnId, {
      personId: personIds ? undefined : filters.personId,
      personIds,
      personType,
      category: filters.category as LedgerCategory | undefined,
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

    let productionSummary;
    const scopedPersonIds = personIds ?? (filters.personId ? [filters.personId] : undefined);
    if (scopedPersonIds) {
      productionSummary = await personProductionTotals(kilnId, scopedPersonIds, filters.from, filters.to);
    }

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
        productionSummary,
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
      productionSummary,
    };
  },
};

// The "master view of a thekedar and all their laborers underneath"
// report — one row per contractor with their gang's combined due/paid/net
// and brick/damage totals, each laborer broken out underneath. Optionally
// scoped to one contractor via `contractorId` (the same filter labourLedger
// uses to mean "this contractor's whole gang").
const labourByContractor: ReportDefinition = {
  key: "labourByContractor",
  titleKey: "reports.title.labourByContractor",
  async run(kilnId, filters) {
    const [allContractors, allPeople] = await Promise.all([listPeople(kilnId, "LABOUR_CONTRACTOR"), listPeople(kilnId)]);
    const contractors = filters.contractorId ? allContractors.filter((c) => c._id === filters.contractorId) : allContractors;
    const peopleById = new Map(allPeople.map((p) => [p._id, p]));

    const contractorRows = await Promise.all(
      contractors.map(async (contractor) => {
        const gangIds = await resolveContractorGang(kilnId, contractor._id);
        const laborerIds = gangIds.filter((id) => id !== contractor._id);
        let laborers = laborerIds.map((id) => peopleById.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
        if (filters.workType) laborers = laborers.filter((l) => l.workType === filters.workType);
        if (filters.status) laborers = laborers.filter((l) => l.status === filters.status);

        const [contractorLedger, laborerLedgers, contractorProd, laborerProds] = await Promise.all([
          listLedgerForKiln(kilnId, { personId: contractor._id, from: filters.from, to: filters.to }),
          Promise.all(laborers.map((l) => listLedgerForKiln(kilnId, { personId: l._id, from: filters.from, to: filters.to }))),
          personProductionTotals(kilnId, [contractor._id], filters.from, filters.to),
          Promise.all(laborers.map((l) => personProductionTotals(kilnId, [l._id], filters.from, filters.to))),
        ]);

        const sumLedger = (entries: typeof contractorLedger) => {
          const due = round2(entries.filter((e) => e.direction === "DUE").reduce((s, e) => s + e.amount, 0));
          const paid = round2(entries.filter((e) => e.direction === "PAID").reduce((s, e) => s + e.amount, 0));
          return { totalDue: due, totalPaid: paid, netAmount: round2(due - paid) };
        };

        const laborerRows = laborers.map((l, i) => ({
          personId: l._id,
          name: l.name,
          type: l.type,
          ...sumLedger(laborerLedgers[i]),
          bricksCount: laborerProds[i].bricksCount,
          damagedCount: laborerProds[i].damagedCount,
        }));

        const contractorOwn = sumLedger(contractorLedger);
        const gangTotals = laborerRows.reduce(
          (acc, l) => ({
            totalDue: round2(acc.totalDue + l.totalDue),
            totalPaid: round2(acc.totalPaid + l.totalPaid),
            netAmount: round2(acc.netAmount + l.netAmount),
            bricksCount: acc.bricksCount + l.bricksCount,
            damagedCount: acc.damagedCount + l.damagedCount,
          }),
          { totalDue: contractorOwn.totalDue, totalPaid: contractorOwn.totalPaid, netAmount: contractorOwn.netAmount, bricksCount: contractorProd.bricksCount, damagedCount: contractorProd.damagedCount }
        );

        return {
          contractorId: contractor._id,
          contractorName: contractor.name,
          ...gangTotals,
          laborerCount: laborers.length,
          laborers: laborerRows,
        };
      })
    );

    // Flatten for Print/Excel — the on-screen view renders the hierarchy
    // directly from `groups` (see ContractorGroupedTable.tsx); this keeps
    // the standard columns/rows contract working unchanged for export.
    const flatRows: Record<string, string | number | null>[] = [];
    for (const c of contractorRows) {
      flatRows.push({ role: "Contractor", name: c.contractorName, reportsTo: "", dueAmount: c.totalDue, paidAmount: c.totalPaid, netAmount: c.netAmount, bricksCount: c.bricksCount, damagedCount: c.damagedCount });
      for (const l of c.laborers) {
        flatRows.push({ role: "Laborer", name: l.name, reportsTo: c.contractorName, dueAmount: l.totalDue, paidAmount: l.totalPaid, netAmount: l.netAmount, bricksCount: l.bricksCount, damagedCount: l.damagedCount });
      }
    }

    return {
      reportKey: "labourByContractor",
      titleKey: "reports.title.labourByContractor",
      columns: [
        { key: "role", labelKey: "reports.col.role", format: "text" },
        { key: "name", labelKey: "reports.col.person", format: "text" },
        { key: "reportsTo", labelKey: "reports.col.contractor", format: "text" },
        { key: "dueAmount", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "paidAmount", labelKey: "reports.col.paidAmount", format: "currency" },
        { key: "netAmount", labelKey: "reports.col.netAmount", format: "currency" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "damagedCount", labelKey: "reports.col.damagedCount", format: "number" },
      ],
      rows: flatRows,
      totals: {
        dueAmount: round2(contractorRows.reduce((s, c) => s + c.totalDue, 0)),
        paidAmount: round2(contractorRows.reduce((s, c) => s + c.totalPaid, 0)),
        netAmount: round2(contractorRows.reduce((s, c) => s + c.netAmount, 0)),
        bricksCount: contractorRows.reduce((s, c) => s + c.bricksCount, 0),
        damagedCount: contractorRows.reduce((s, c) => s + c.damagedCount, 0),
      },
      groups: contractorRows,
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

export const peopleReports: ReportDefinition[] = [labourLedger, labourByContractor, salary];
