import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersonTypeMeta, useWorkTypeLabels } from "@/components/people/personTypes";
import { formatINR } from "@/lib/utils";
import { ReportRail } from "@/components/reports/ReportRail";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, RowHighlight } from "@/components/reports/ReportTable";
import { ContractorGroupedTable } from "@/components/reports/ContractorGroupedTable";
import { REPORT_DEFINITIONS } from "@/lib/reportDefinitions";
import { printReportTable } from "@/lib/printDocument";
import { buildReportWorkbookBlob, downloadExcelFile, shareExcelFile } from "@/lib/exportExcel";
import type { Person, PersonFullReport, Customer, KilnVehicle, ExpenseType, Supplier, SalesAgentSummary, BrickCategory } from "@/types";
import type { ReportResult, ReportRunParams, DashboardSummary } from "@/types/reports";

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-ink-primary/5 pl-10 pr-3.5 text-sm text-ink-primary outline-none transition-shadow focus:ring-2 focus:ring-series-1";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN");
}

function SectionCard({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
        {count != null ? ` (${count})` : ""}
      </h4>
      {children}
    </Card>
  );
}

// One complete, read-only "everything about this person" report — search
// by name across every person type at once (no type-first step, unlike
// the People page's tabs), then render whichever sections the backend
// actually returned for that person (see report.service.ts — the section
// list is type/workType-driven, so a customer never shows a "work
// entries" section and a labourer never shows a "dispatches" section).
function PersonLookupPanel() {
  const { t } = useTranslation();
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [report, setReport] = useState<PersonFullReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const personTypeMeta = usePersonTypeMeta();
  const workTypeLabels = useWorkTypeLabels();

  useEffect(() => {
    if (!activeKilnId) return;
    api.people.list().then(setAllPeople).catch(console.error);
  }, [activeKilnId]);

  const filteredPeople =
    search.trim().length === 0
      ? []
      : allPeople.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.phone ?? "").includes(search)).slice(0, 8);

  function selectPerson(p: Person) {
    setSelectedPerson(p);
    setSearch("");
    setReport(null);
    setLoadingReport(true);
    api.people
      .report(p._id)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoadingReport(false));
  }

  const s = report?.sections;

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("reports.heading")}</h4>
        <p className="mb-3 text-sm text-ink-muted">{t("reports.description")}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("reports.searchPlaceholder")}
            className={inputClass}
          />
          {filteredPeople.length > 0 && (
            <div className="glass-panel absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl p-1 shadow-glass">
              {filteredPeople.map((p) => (
                <button
                  key={p._id}
                  onClick={() => selectPerson(p)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary"
                >
                  <span>
                    {p.name} {p.phone ? <span className="text-ink-muted">· {p.phone}</span> : ""}
                  </span>
                  <Badge variant="neutral">{personTypeMeta[p.type].label}</Badge>
                </button>
              ))}
            </div>
          )}
          {search.trim() && filteredPeople.length === 0 && (
            <div className="glass-panel absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl p-3 text-sm text-ink-muted shadow-glass">
              {t("reports.noMatches")}
            </div>
          )}
        </div>
      </Card>

      {loadingReport && (
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      )}

      {!loadingReport && report && selectedPerson && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-primary">{report.person.name}</h3>
                <p className="text-sm text-ink-muted">
                  {personTypeMeta[report.person.type].label}
                  {report.person.workType ? ` · ${workTypeLabels[report.person.workType]}` : ""}
                  {report.person.phone ? ` · ${report.person.phone}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-semibold tabular-nums ${report.balance > 0 ? "text-status-critical" : report.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                  ₹{formatINR(Math.abs(report.balance))}
                </p>
                <p className="text-sm text-ink-muted">{report.balance >= 0 ? t("reports.balanceDue") : t("reports.balanceAdvance")}</p>
              </div>
            </div>
          </Card>

          <SectionCard title={t("reports.ledgerHistory")} count={s?.ledger.length}>
            {!s?.ledger.length ? (
              <p className="py-4 text-center text-sm text-ink-muted">{t("reports.noRecords")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-ink-muted">
                      <th className="pb-2 font-medium">{t("common.date")}</th>
                      <th className="pb-2 font-medium">{t("reports.reason")}</th>
                      <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.ledger.map((e) => (
                      <tr key={e._id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 text-ink-secondary">{fmtDate(e.date)}</td>
                        <td className="py-2 text-ink-secondary">{e.reason}</td>
                        <td className={`py-2 text-right tabular-nums font-medium ${e.direction === "DUE" ? "text-status-critical" : "text-status-good"}`}>
                          {e.direction === "DUE" ? "+" : "−"}₹{formatINR(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {s?.paymentReceipts && s.paymentReceipts.length > 0 && (
            <SectionCard title={t("reports.paymentReceipts")} count={s.paymentReceipts.length}>
              <div className="space-y-1">
                {s.paymentReceipts.map((r) => (
                  <div key={r._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">
                      {r.receiptNumber} · {fmtDate(r.date)}
                    </span>
                    <span className="tabular-nums font-medium text-status-good">₹{formatINR(r.amountPaid)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.workEntries && s.workEntries.length > 0 && (
            <SectionCard title={t("reports.workHistory")} count={s.workEntries.length}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-ink-muted">
                      <th className="pb-2 font-medium">{t("common.date")}</th>
                      <th className="pb-2 font-medium">{t("reports.workType")}</th>
                      <th className="pb-2 font-medium text-right">{t("common.quantity")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.workEntries.map((w) => (
                      <tr key={w._id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 text-ink-secondary">{fmtDate(w.date)}</td>
                        <td className="py-2 text-ink-secondary">{workTypeLabels[w.workType]}</td>
                        <td className="py-2 text-right tabular-nums text-ink-primary">{w.quantity.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {s?.family && s.family.members.length > 0 && (
            <SectionCard title={t("reports.familyMembers")} count={s.family.members.length}>
              <div className="space-y-1">
                {s.family.members.map((m) => (
                  <div key={m._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-primary">{m.name}</span>
                    <span className="text-ink-muted">{m.relation}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.suppliedItems && s.suppliedItems.length > 0 && (
            <SectionCard title={t("reports.suppliedItems")} count={s.suppliedItems.length}>
              <div className="space-y-1">
                {s.suppliedItems.map((si) => (
                  <div key={si._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">
                      {typeof si.itemId === "object" ? si.itemId.name : "—"} · {fmtDate(si.date)}
                    </span>
                    <span className="tabular-nums font-medium text-ink-primary">{si.quantity}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.salarySlips && s.salarySlips.length > 0 && (
            <SectionCard title={t("reports.salarySlips")} count={s.salarySlips.length}>
              <div className="space-y-1">
                {s.salarySlips.map((sl) => (
                  <div key={sl._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">{sl.month}</span>
                    <span className="tabular-nums font-medium text-ink-primary">₹{formatINR(sl.netSalary)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.attendance && s.attendance.length > 0 && (
            <SectionCard title={t("reports.attendanceExceptions")} count={s.attendance.length}>
              <div className="space-y-1">
                {s.attendance.map((a) => (
                  <div key={a._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">{fmtDate(a.date)}</span>
                    <Badge variant={a.status === "PRESENT" ? "good" : a.status === "ABSENT" ? "critical" : "warning"}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.stackingEntries && s.stackingEntries.length > 0 && (
            <SectionCard title={t("reports.stackingHistory")} count={s.stackingEntries.length}>
              <div className="space-y-1">
                {s.stackingEntries.map((e) => (
                  <div key={e._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">{fmtDate(e.date)}</span>
                    <span className="tabular-nums font-medium text-ink-primary">{e.bricksCount.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-ink-muted">{t("reports.gangLevelNote")}</p>
            </SectionCard>
          )}

          {s?.nikasiEntries && s.nikasiEntries.length > 0 && (
            <SectionCard title={t("reports.nikasiHistory")} count={s.nikasiEntries.length}>
              <div className="space-y-1">
                {s.nikasiEntries.map((e) => (
                  <div key={e._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">{fmtDate(e.date)}</span>
                    <span className="tabular-nums font-medium text-ink-primary">{e.bricksCount.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-ink-muted">{t("reports.gangLevelNote")}</p>
            </SectionCard>
          )}

          {s?.moldingContractor && (
            <SectionCard title={t("reports.moldingSummary")}>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{s.moldingContractor.totalBricksProduced.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("reports.bricksProduced")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-status-critical">{s.moldingContractor.totalDamaged.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("reports.damaged")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${s.moldingContractor.balance > 0 ? "text-status-critical" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(s.moldingContractor.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{s.moldingContractor.balance >= 0 ? t("reports.balanceDue") : t("reports.balanceAdvance")}</p>
                </div>
              </div>
            </SectionCard>
          )}

          {s?.firingShifts && s.firingShifts.length > 0 && (
            <SectionCard title={t("reports.firingShifts")} count={s.firingShifts.length}>
              <div className="space-y-1">
                {s.firingShifts.map((f) => (
                  <div key={f._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">
                      {fmtDate(f.date)} · {f.shiftType}
                    </span>
                    <span className="tabular-nums text-ink-primary">{f.bonusAmount ? `₹${formatINR(f.bonusAmount)}` : "—"}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.soilArrivals && s.soilArrivals.length > 0 && (
            <SectionCard title={t("reports.soilArrivals")} count={s.soilArrivals.length}>
              <div className="space-y-1">
                {s.soilArrivals.map((a) => (
                  <div key={a._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">{fmtDate(a.date)}</span>
                    <span className="tabular-nums text-ink-primary">{a.trolleyCount} trolleys</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.soilContracts && s.soilContracts.length > 0 && (
            <SectionCard title={t("reports.soilContracts")} count={s.soilContracts.length}>
              <div className="space-y-1">
                {s.soilContracts.map((c) => (
                  <div key={c._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">{c.contractNumber}</span>
                    <Badge variant="neutral">{c.status}</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.brickLoadingEntries && s.brickLoadingEntries.length > 0 && (
            <SectionCard title={t("reports.brickLoadingTrips")} count={s.brickLoadingEntries.length}>
              <div className="space-y-1">
                {s.brickLoadingEntries.map((e) => (
                  <div key={e._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-ink-secondary">
                      {fmtDate(e.date)} · {e.vehicleNumber}
                    </span>
                    <span className="tabular-nums text-ink-primary">{e.bricksCount.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {s?.dispatches && s.dispatches.length > 0 && (
            <SectionCard title={t("reports.dispatchHistory")} count={s.dispatches.length}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-ink-muted">
                      <th className="pb-2 font-medium">{t("dispatch.slipHeader")}</th>
                      <th className="pb-2 font-medium">{t("common.date")}</th>
                      <th className="pb-2 font-medium">{t("dispatch.bricksHeader")}</th>
                      <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.dispatches.map((d) => (
                      <tr key={d._id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 text-ink-secondary">{d.slipNumber}</td>
                        <td className="py-2 text-ink-secondary">{fmtDate(d.dispatchedOn)}</td>
                        <td className="py-2 tabular-nums text-ink-secondary">{d.bricksCount.toLocaleString("en-IN")}</td>
                        <td className="py-2 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

// The cross-entity reporting engine: pick any of the 18 report types from
// the left rail, filter it (date range/preset, groupBy, and whichever
// entity pickers that report declares), generate it, then view on screen,
// print, or export to Excel (download or share). Table rendering is fully
// generic off the backend's own `columns` — see ReportTable.
function ReportsWorkspace() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };

  const [people, setPeople] = useState<Person[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<KilnVehicle[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesAgents, setSalesAgents] = useState<SalesAgentSummary[]>([]);
  const [brickCategories, setBrickCategories] = useState<BrickCategory[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [params, setParams] = useState<ReportRunParams>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeKilnId) return;
    api.people.list().then(setPeople).catch(console.error);
    api.customers.list().then(setCustomers).catch(console.error);
    api.kilnVehicles.list().then(setVehicles).catch(console.error);
    api.expenseTypes.list().then(setExpenseTypes).catch(console.error);
    api.suppliers.list().then(setSuppliers).catch(console.error);
    api.salesAgents.list().then(setSalesAgents).catch(console.error);
    api.brickCategories.list().then(setBrickCategories).catch(console.error);
    api.reports.dashboardSummary().then(setDashboard).catch(console.error);
  }, [activeKilnId]);

  const definition = REPORT_DEFINITIONS.find((d) => d.key === selectedKey);

  function selectReport(key: string) {
    setSelectedKey(key);
    setParams({});
    setResult(null);
    setError(null);
  }

  // Drill-down from a dashboard category card straight into the filtered
  // Labour/Contractor/Staff report — the admin never has to hunt for the
  // right report + set the filter by hand.
  function drillIntoCategory(category: string) {
    setSelectedKey("labourLedger");
    setParams({ category });
    setResult(null);
    setError(null);
  }

  function getRowHighlight(row: ReportResult["rows"][number]): RowHighlight {
    if (!definition) return undefined;
    if (["molding", "stacking", "nikasi"].includes(definition.key) && params.damageThreshold != null) {
      const damaged = Number(row.damagedCount ?? row.damageCount ?? 0);
      if (damaged > params.damageThreshold) return "critical";
    }
    if (definition.key === "labourLedger" && (!params.groupBy || params.groupBy === "none")) {
      if (row.direction === "DUE" && typeof row.date === "string") {
        const daysPending = Math.floor((Date.now() - new Date(row.date).getTime()) / 86400000);
        if (daysPending > 7) return "warning";
      }
    }
    return undefined;
  }

  async function generate() {
    if (!definition) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.reports.run(definition.key, params);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function filterSummaryLines(): string[] {
    const lines: string[] = [];
    if (params.from || params.to) lines.push(`${params.from ?? "…"} – ${params.to ?? "…"}`);
    if (params.groupBy && params.groupBy !== "none") lines.push(t(`reports.groupBy.${params.groupBy}`));
    return lines;
  }

  function handlePrint() {
    if (!result || !definition) return;
    printReportTable(
      kilnInfo,
      t(definition.labelKey),
      filterSummaryLines(),
      result.columns.map((c) => ({ key: c.key, label: t(c.labelKey), format: c.format })),
      result.rows,
      result.totals
    );
  }

  function columnLabels() {
    if (!result) return {};
    return Object.fromEntries(result.columns.map((c) => [c.key, t(c.labelKey)]));
  }

  function handleDownloadExcel() {
    if (!result || !definition) return;
    const blob = buildReportWorkbookBlob(result.columns, result.rows, result.totals, columnLabels(), t(definition.labelKey));
    downloadExcelFile(blob, `${definition.key}-report.xlsx`);
  }

  async function handleShareExcel() {
    if (!result || !definition) return;
    const blob = buildReportWorkbookBlob(result.columns, result.rows, result.totals, columnLabels(), t(definition.labelKey));
    await shareExcelFile(blob, `${definition.key}-report.xlsx`);
  }

  const [sendTextOpen, setSendTextOpen] = useState(false);
  const [sendTextPhone, setSendTextPhone] = useState("");
  const [sendTextStatus, setSendTextStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendTextError, setSendTextError] = useState<string | null>(null);

  async function handleSendText() {
    if (!definition || !sendTextPhone.trim()) return;
    setSendTextStatus("sending");
    setSendTextError(null);
    try {
      await api.reports.sendText(definition.key, sendTextPhone.trim(), params);
      setSendTextStatus("sent");
    } catch (err) {
      setSendTextStatus("error");
      setSendTextError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      {dashboard && <DashboardCards dashboard={dashboard} onCategoryClick={drillIntoCategory} />}

      <div className="flex flex-col gap-4 lg:flex-row">
        <ReportRail selectedKey={selectedKey} onSelect={selectReport} />

        <div className="min-w-0 flex-1 space-y-4">
          {!definition && (
            <Card>
              <p className="py-10 text-center text-sm text-ink-muted">{t("reports.workspace.selectPrompt")}</p>
            </Card>
          )}

        {definition && (
          <>
            <ReportFilterBar
              key={definition.key}
              definition={definition}
              params={params}
              onChange={setParams}
              onGenerate={generate}
              loading={loading}
              people={people}
              customers={customers}
              vehicles={vehicles}
              expenseTypes={expenseTypes}
              suppliers={suppliers}
              salesAgents={salesAgents}
              brickCategories={brickCategories}
            />

            {error && (
              <Card>
                <p className="text-sm text-status-critical">{error}</p>
              </Card>
            )}

            {loading && (
              <Card>
                <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
              </Card>
            )}

            {!loading && result && (
              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink-primary">{t(definition.labelKey)}</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
                    >
                      {t("reports.action.print")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExcel}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
                    >
                      {t("reports.action.downloadExcel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleShareExcel}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
                    >
                      {t("reports.action.shareExcel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSendTextOpen((v) => !v);
                        setSendTextStatus("idle");
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
                    >
                      {t("reports.action.sendText")}
                    </button>
                  </div>
                </div>

                {sendTextOpen && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-ink-primary/[0.02] px-4 py-3">
                    <input
                      type="tel"
                      value={sendTextPhone}
                      onChange={(e) => setSendTextPhone(e.target.value)}
                      placeholder={t("reports.action.sendTextPhonePlaceholder")}
                      className="h-9 rounded-lg border border-border bg-transparent px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                    />
                    <button
                      type="button"
                      onClick={handleSendText}
                      disabled={sendTextStatus === "sending" || !sendTextPhone.trim()}
                      className="h-9 rounded-lg bg-gradient-to-r from-series-1 to-series-2 px-4 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {sendTextStatus === "sending" ? t("common.loading") : t("reports.action.sendText")}
                    </button>
                    {sendTextStatus === "sent" && <span className="text-xs font-medium text-status-good">{t("reports.action.sendTextSent")}</span>}
                    {sendTextStatus === "error" && <span className="text-xs font-medium text-status-critical">{sendTextError}</span>}
                  </div>
                )}

                {definition.key === "labourLedger" && params.personId && !params.contractorId && result.totals && (
                  <div className="mb-3 flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
                    <span className="text-sm font-medium text-ink-secondary">{t("reports.workspace.payableToday")}</span>
                    <span className={`text-lg font-bold tabular-nums ${result.totals.netAmount > 0 ? "text-status-critical" : "text-status-good"}`}>
                      ₹{formatINR(Math.abs(result.totals.netAmount))} {result.totals.netAmount > 0 ? t("reports.workspace.owedByKiln") : t("reports.workspace.advanceHeld")}
                    </span>
                  </div>
                )}

                {result.productionSummary && (result.productionSummary.bricksCount > 0 || result.productionSummary.damagedCount > 0) && (
                  <div className="mb-3 flex flex-wrap gap-4 rounded-xl border border-border bg-ink-primary/[0.02] px-4 py-3 text-sm">
                    <span className="text-ink-muted">{t("reports.workspace.everyBrick")}:</span>
                    <span className="font-semibold tabular-nums text-ink-primary">
                      {result.productionSummary.bricksCount.toLocaleString("en-IN")} {t("reports.col.bricksCount")}
                    </span>
                    {result.productionSummary.damagedCount > 0 && (
                      <span className="font-semibold tabular-nums text-status-critical">
                        {result.productionSummary.damagedCount.toLocaleString("en-IN")} {t("reports.col.damagedCount")}
                      </span>
                    )}
                    {result.productionSummary.byModule.map((m) => (
                      <span key={m.module} className="text-xs text-ink-muted">
                        {t(`reports.title.${m.module}`)}: {m.bricksCount.toLocaleString("en-IN")}
                      </span>
                    ))}
                  </div>
                )}

                {result.groups ? <ContractorGroupedTable groups={result.groups} /> : <ReportTable result={result} rowHighlight={getRowHighlight} />}
              </Card>
            )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// Always-visible "single centralized dashboard" strip at the top of the
// Reports workspace — pulled from GET /reports/dashboard-summary, itself
// built from the same balance functions Overview/Salary/Customer pages
// already use, so these numbers can never drift from what those pages show.
function DashboardCards({ dashboard, onCategoryClick }: { dashboard: DashboardSummary; onCategoryClick: (category: string) => void }) {
  const { t } = useTranslation();
  const cards: { labelKey: string; value: string; tone?: "critical" | "good" | "warning" }[] = [
    { labelKey: "reports.dashboard.totalPendingDues", value: `₹${formatINR(dashboard.totalPendingDues)}`, tone: dashboard.totalPendingDues > 0 ? "critical" : "good" },
    { labelKey: "reports.dashboard.totalOutstandingAdvances", value: `₹${formatINR(dashboard.totalOutstandingAdvances)}`, tone: dashboard.totalOutstandingAdvances > 0 ? "warning" : undefined },
    { labelKey: "reports.dashboard.totalCustomerDue", value: `₹${formatINR(dashboard.totalCustomerDue)}`, tone: dashboard.totalCustomerDue > 0 ? "critical" : "good" },
    { labelKey: "reports.dashboard.bricksDamagedThisWeek", value: dashboard.bricksDamagedThisWeek.toLocaleString("en-IN"), tone: dashboard.bricksDamagedThisWeek > 0 ? "warning" : undefined },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.labelKey}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(c.labelKey)}</p>
            <p
              className={`mt-1 text-xl font-bold tabular-nums ${
                c.tone === "critical" ? "text-status-critical" : c.tone === "warning" ? "text-status-warning" : c.tone === "good" ? "text-status-good" : "text-ink-primary"
              }`}
            >
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      {dashboard.categoryBreakdownThisMonth.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("reports.dashboard.categoryBreakdown")}</p>
          <div className="flex flex-wrap gap-2">
            {dashboard.categoryBreakdownThisMonth.map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => onCategoryClick(c.category)}
                className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
              >
                <span className="block text-xs text-ink-muted">{t(`reports.ledgerCategory.${c.category}`)}</span>
                <span className="font-semibold tabular-nums text-ink-primary">₹{formatINR(c.paid)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {(dashboard.topPendingDues.length > 0 || dashboard.salaryStatusThisMonth.totalStaff > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {dashboard.topPendingDues.length > 0 && (
            <Card>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("reports.dashboard.topPendingDues")}</p>
              <div className="space-y-1.5">
                {dashboard.topPendingDues.map((p) => (
                  <div key={p.personId} className="flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{p.name}</span>
                    <span className="font-semibold tabular-nums text-status-critical">₹{formatINR(p.amountDue)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {dashboard.salaryStatusThisMonth.totalStaff > 0 && (
            <Card>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("reports.dashboard.salaryStatus")}</p>
              <p className="text-sm text-ink-secondary">
                {t("reports.dashboard.salaryGenerated", { count: dashboard.salaryStatusThisMonth.generated })} · {t("reports.dashboard.salaryPending", { count: dashboard.salaryStatusThisMonth.pending })}
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function Reports() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"personLookup" | "workspace">("personLookup");

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={[
          { value: "personLookup", label: t("reports.tab.personLookup") },
          { value: "workspace", label: t("reports.tab.workspace") },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === "personLookup" ? <PersonLookupPanel /> : <ReportsWorkspace />}
    </div>
  );
}
