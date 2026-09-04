import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { PeriodStatCard } from "@/components/dashboard/PeriodStatCard";
import { api } from "@/lib/api";
import { EditNikasiEntryModal } from "@/components/nikasi/EditNikasiEntryModal";
import { NikasiOperatorDetailPage } from "@/components/nikasi/NikasiOperatorDetailPage";
import { NikasiContractorDetailPage } from "@/components/nikasi/NikasiContractorDetailPage";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { Gher, NikasiContractorSummary, NikasiEntry, NikasiOperatorSummary, NikasiPeriodTotals, Person } from "@/types";
import { formatINR } from "@/lib/utils";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Thekedar-wise nikasi summary — mirrors Stacking.tsx's ContractorSummarySection:
// each contractor's mapped labor gang, combined output and ledger balance,
// click-through to their full profile.
function ContractorSummarySection({
  summary,
  onOpenLedger,
  onOpenContractor,
  onAddThekedar,
}: {
  summary: NikasiContractorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenContractor: (contractorId: string) => void;
  onAddThekedar: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink-primary">{t("nikasi.thekedarWise")}</h4>
          <p className="text-sm text-ink-muted">{t("nikasi.thekedarWiseSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("nikasi.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalProductionAllContractors.toLocaleString("en-IN")}</span> {t("nikasi.bricksUnit")}
            </p>
          )}
          <Button size="sm" onClick={onAddThekedar}>
            <Plus className="h-4 w-4" /> {t("nikasi.newThekedar")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.contractors.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("nikasi.noThekedarsYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.contractors.map((c) => (
            <Card key={c.contractor.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenContractor(c.contractor.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{c.contractor.name}</p>
                  <p className="text-sm text-ink-muted">
                    {t("nikasi.laborerCount", { count: c.laborers.length, suffix: c.laborers.length === 1 ? "" : "s" })}
                    {c.contractor.monthlySalary ? ` · ₹${formatINR(c.contractor.monthlySalary)}${t("nikasi.perMonthSuffix")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(c.contractor.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("nikasi.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{c.totalBricksUnloaded.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("nikasi.bricksUnit")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${c.totalDamaged > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                    {c.totalDamaged.toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm text-ink-muted">{t("nikasi.damagedLabel")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(c.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("nikasi.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${c.balance > 0 ? "text-status-critical" : c.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(c.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{c.balance >= 0 ? t("nikasi.dueLabel") : t("nikasi.advanceLabel")}</p>
                </div>
              </div>

              {c.laborers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {c.laborers.map((w) => (
                    <span key={w.id} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      {w.name} · {t("nikasi.unloadedSuffix", { count: w.bricksUnloaded.toLocaleString("en-IN") })}
                      {w.damagedCount > 0 ? ` · ${t("nikasi.damagedSuffix", { count: w.damagedCount.toLocaleString("en-IN") })}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Operator-wise nikasi summary — for independent gang heads not mapped
// under any thekedar.
function OperatorSummarySection({
  summary,
  onOpenLedger,
  onOpenOperator,
  onAddOperator,
}: {
  summary: NikasiOperatorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenOperator: (operatorId: string) => void;
  onAddOperator: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink-primary">{t("nikasi.independentOperators")}</h4>
          <p className="text-sm text-ink-muted">{t("nikasi.independentOperatorsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("nikasi.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalBricksUnloadedAllOperators.toLocaleString("en-IN")}</span> {t("nikasi.bricksUnit")}
            </p>
          )}
          <Button size="sm" onClick={onAddOperator}>
            <Plus className="h-4 w-4" /> {t("nikasi.newOperator")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.operators.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("nikasi.noOperatorsYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.operators.map((o) => (
            <Card key={o.operator.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenOperator(o.operator.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{o.operator.name}</p>
                  <p className="text-sm text-ink-muted">
                    {t("nikasi.tripCount", { count: o.tripCount, suffix: o.tripCount === 1 ? "" : "s" })}
                    {o.operator.monthlySalary ? ` · ₹${formatINR(o.operator.monthlySalary)}${t("nikasi.perMonthSuffix")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(o.operator.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("nikasi.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{o.totalBricksUnloaded.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("nikasi.bricksUnit")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${o.totalDamaged > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                    {o.totalDamaged.toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm text-ink-muted">{t("nikasi.damagedLabel")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(o.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("nikasi.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${o.balance > 0 ? "text-status-critical" : o.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(o.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{o.balance >= 0 ? t("nikasi.dueLabel") : t("nikasi.advanceLabel")}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nikasi() {
  const { t } = useTranslation();
  const [ghers, setGhers] = useState<Gher[]>([]);
  const [entries, setEntries] = useState<NikasiEntry[]>([]);
  const [gangs, setGangs] = useState<Person[]>([]);
  const [operatorSummary, setOperatorSummary] = useState<NikasiOperatorSummary | null>(null);
  const [contractorSummary, setContractorSummary] = useState<NikasiContractorSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [openOperatorId, setOpenOperatorId] = useState<string | null>(null);
  const [openContractorId, setOpenContractorId] = useState<string | null>(null);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [showAddThekedar, setShowAddThekedar] = useState(false);
  const [editingEntry, setEditingEntry] = useState<NikasiEntry | null>(null);
  const [form, setForm] = useState({ gherId: "", gangId: "", bricksCount: "", damagedCount: "", damageFault: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [periodTotals, setPeriodTotals] = useState<NikasiPeriodTotals | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [ghersData, entriesData, contractors, workers, summary, contractorSummaryData, periods] = await Promise.all([
      api.ghers.list(),
      api.nikasi.list(),
      api.people.list("LABOUR_CONTRACTOR"),
      api.people.list("WORKER"),
      api.nikasi.operatorSummary(),
      api.nikasi.contractorSummary(),
      api.nikasi.periodTotals(),
    ]);
    setGhers(ghersData);
    setEntries(entriesData);
    setGangs([...contractors, ...workers]);
    setOperatorSummary(summary);
    setContractorSummary(contractorSummaryData);
    setPeriodTotals(periods);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("nikasi:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  function openLedgerFor(personId: string) {
    const person = gangs.find((p) => p._id === personId);
    if (person) setLedgerFor(person);
  }

  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(entries, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.gherId || !form.gangId || !form.bricksCount) return;
    setFormError("");
    setLoading(true);
    try {
      await api.nikasi.create({
        gherId: form.gherId,
        gangId: form.gangId,
        bricksCount: Number(form.bricksCount),
        damagedCount: form.damagedCount ? Number(form.damagedCount) : undefined,
        damageFault: form.damagedCount && form.damageFault ? (form.damageFault as "LABOURER" | "CONTRACTOR" | "OTHER") : undefined,
        notes: form.notes || undefined,
      });
      setForm({ gherId: "", gangId: "", bricksCount: "", damagedCount: "", damageFault: "", notes: "" });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  if (openContractorId) {
    return <NikasiContractorDetailPage contractorId={openContractorId} onBack={() => setOpenContractorId(null)} />;
  }

  if (openOperatorId) {
    return <NikasiOperatorDetailPage operatorId={openOperatorId} onBack={() => setOpenOperatorId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PeriodStatCard
          label={t("nikasi.todayUnloading")}
          value={periodTotals?.today ?? 0}
          subtitle={t("nikasi.firedBricksUnloadedToday")}
          icon={ArrowDownToLine}
          tone="text-series-2"
        />
        <PeriodStatCard
          label={t("nikasi.weeklyUnloading")}
          value={periodTotals?.week ?? 0}
          subtitle={t("nikasi.last7Days")}
          icon={ArrowDownToLine}
          tone="text-series-3"
        />
        <PeriodStatCard
          label={t("nikasi.monthlyUnloading")}
          value={periodTotals?.month ?? 0}
          subtitle={t("nikasi.last30Days")}
          icon={ArrowDownToLine}
          tone="text-series-6"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PeriodStatCard
          label={t("nikasi.todayDamage")}
          value={periodTotals?.todayDamaged ?? 0}
          subtitle={t("nikasi.bricksDamagedToday")}
          icon={AlertTriangle}
          critical
        />
        <PeriodStatCard
          label={t("nikasi.weeklyDamage")}
          value={periodTotals?.weekDamaged ?? 0}
          subtitle={t("nikasi.last7Days")}
          icon={AlertTriangle}
          critical
        />
        <PeriodStatCard
          label={t("nikasi.monthlyDamage")}
          value={periodTotals?.monthDamaged ?? 0}
          subtitle={t("nikasi.last30Days")}
          icon={AlertTriangle}
          critical
        />
      </div>

      <ContractorSummarySection
        summary={contractorSummary}
        onOpenLedger={openLedgerFor}
        onOpenContractor={setOpenContractorId}
        onAddThekedar={() => setShowAddThekedar(true)}
      />

      <OperatorSummarySection
        summary={operatorSummary}
        onOpenLedger={openLedgerFor}
        onOpenOperator={setOpenOperatorId}
        onAddOperator={() => setShowAddOperator(true)}
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("nikasi.logEntry")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.gherId}
              onChange={(e) => setForm((f) => ({ ...f, gherId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("nikasi.chamberPlaceholder")}</option>
              {(ghers.some((g) => g.status === "UNLOADING") ? ghers.filter((g) => g.status === "UNLOADING") : ghers).map((g) => (
                <option key={g._id} value={g._id}>
                  {t("nikasi.gherNumberStatus", { number: g.number, status: g.status })}
                </option>
              ))}
            </select>
            <select
              required
              value={form.gangId}
              onChange={(e) => setForm((f) => ({ ...f, gangId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("nikasi.gangJamadaarPlaceholder")}</option>
              {gangs.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("nikasi.bricksUnloadedPlaceholder")}
              value={form.bricksCount}
              onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              placeholder={t("nikasi.damagedBricksOptionalPlaceholder")}
              value={form.damagedCount}
              onChange={(e) => setForm((f) => ({ ...f, damagedCount: e.target.value }))}
              className={inputClass}
            />
            {Number(form.damagedCount) > 0 && (
              <select
                value={form.damageFault}
                onChange={(e) => setForm((f) => ({ ...f, damageFault: e.target.value }))}
                className={inputClass}
              >
                <option value="">{t("production.damageFaultPlaceholder")}</option>
                <option value="LABOURER">{t("reports.damageFault.LABOURER")}</option>
                <option value="CONTRACTOR">{t("reports.damageFault.CONTRACTOR")}</option>
                <option value="OTHER">{t("reports.damageFault.OTHER")}</option>
              </select>
            )}
            <input
              placeholder={t("common.notesOptional")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
            {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("nikasi.saveEntry")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("nikasi.noEntriesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("nikasi.chamberHeader")}</th>
                  <th className="pb-2 font-medium">{t("nikasi.gangHeader")}</th>
                  <th className="pb-2 font-medium">{t("nikasi.bricksHeader")}</th>
                  <th className="pb-2 font-medium">{t("nikasi.damagedHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.notes")}</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => {
                  const gangId = typeof entry.gangId === "object" ? entry.gangId._id : entry.gangId;
                  const isContractor = typeof entry.gangId === "object" && entry.gangId.type === "LABOUR_CONTRACTOR";
                  return (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">
                        #{typeof entry.gherId === "object" ? entry.gherId.number : "—"}
                      </td>
                      <td className="py-3 text-ink-primary">
                        {typeof entry.gangId === "object" ? (
                          <button
                            onClick={() => (isContractor ? setOpenContractorId(gangId) : setOpenOperatorId(gangId))}
                            className="hover:underline"
                          >
                            {entry.gangId.name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums">
                        {entry.damagedCount ? (
                          <span className="text-status-critical">{entry.damagedCount.toLocaleString("en-IN")}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 text-ink-secondary">{entry.notes ?? "—"}</td>
                      <td className="py-3 text-right">
                        <button onClick={() => setEditingEntry(entry)} className="text-xs font-medium text-series-1 hover:underline">
                          {t("common.edit")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {showAddOperator && (
        <AddPersonModal defaultType="WORKER" onClose={() => setShowAddOperator(false)} onCreated={refresh} />
      )}
      {showAddThekedar && (
        <AddPersonModal defaultType="LABOUR_CONTRACTOR" onClose={() => setShowAddThekedar(false)} onCreated={refresh} />
      )}
      {editingEntry && (
        <EditNikasiEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
