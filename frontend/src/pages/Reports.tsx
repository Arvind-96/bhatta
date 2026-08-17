import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersonTypeMeta, useWorkTypeLabels } from "@/components/people/personTypes";
import { formatINR } from "@/lib/utils";
import type { Person, PersonFullReport } from "@/types";

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
export function Reports() {
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
