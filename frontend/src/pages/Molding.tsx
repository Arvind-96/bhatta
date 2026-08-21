import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Hammer, Pencil, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PeriodStatCard } from "@/components/dashboard/PeriodStatCard";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/auth.store";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { ContractorDetailPage } from "@/components/molding/ContractorDetailPage";
import { LaborDetailPage } from "@/components/molding/LaborDetailPage";
import { EditMoldingEntryModal } from "@/components/molding/EditMoldingEntryModal";
import type { MoldingContractorSummary, MoldingEntry, MoldingPeriodTotals, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Contractor-wise summary: for each thekedar, their gang's total production
// and the combined ledger (their own commission + every worker under them),
// so an owner can see "what do I owe Mangal Sardar's whole gang" at a
// glance instead of adding it up person by person.
function ContractorSummarySection({
  summary,
  onOpenLedger,
  onOpenContractor,
  onOpenWorker,
  onAddThekedar,
}: {
  summary: MoldingContractorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenContractor: (contractorId: string) => void;
  onOpenWorker: (workerId: string) => void;
  onAddThekedar: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">{t("molding.contractorWiseProduction")}</h3>
          <p className="text-sm text-ink-muted">{t("molding.contractorWiseHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("molding.totalAcrossContractors")} <span className="font-medium text-ink-primary">{summary.totalProductionAllContractors.toLocaleString("en-IN")}</span> {t("molding.bricksUnit")}
            </p>
          )}
          <Button size="sm" onClick={onAddThekedar}>
            <Plus className="h-4 w-4" /> {t("molding.newThekedar")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.contractors.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">
            {t("molding.noThekedarsTagged")}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.contractors.map((c) => (
            <Card key={c.contractor.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenContractor(c.contractor.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{c.contractor.name}</p>
                  <p className="text-sm text-ink-muted">
                    {c.workers.length} {t(c.workers.length === 1 ? "molding.worker" : "molding.workers")}
                    {c.contractor.commissionPerThousand ? ` · ₹${c.contractor.commissionPerThousand}/1000 ${t("molding.commissionWord")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(c.contractor.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("molding.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{c.totalBricksProduced.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("molding.bricksUnit")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${c.totalDamaged > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                    {c.totalDamaged.toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm text-ink-muted">{t("molding.damagedLabel")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(c.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("molding.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${c.balance > 0 ? "text-status-critical" : c.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(c.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{t(c.balance >= 0 ? "molding.dueLabel" : "molding.advanceLabel")}</p>
                </div>
              </div>

              {c.workers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {c.workers.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onOpenWorker(w.id)}
                      className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                    >
                      {w.name} · {w.bricksProduced.toLocaleString("en-IN")} {t("molding.madeLabel")}
                      {w.damagedCount > 0 ? ` · ${w.damagedCount.toLocaleString("en-IN")} ${t("molding.damagedLabel")}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {summary && summary.unassignedWorkerCount > 0 && (
        <p className="text-sm text-ink-muted">
          {summary.unassignedWorkerCount} {t(summary.unassignedWorkerCount === 1 ? "molding.worker" : "molding.workers")} {t("molding.notAssignedToThekedar")}{" "}
          {summary.unassignedBricksProduced.toLocaleString("en-IN")} {t("molding.bricksMoldedWord")}
          {summary.unassignedDamaged > 0 ? ` (${summary.unassignedDamaged.toLocaleString("en-IN")} ${t("molding.damagedLabel")})` : ""} {t("molding.outsideContractorHierarchyWord")}
        </p>
      )}
    </div>
  );
}

export function Molding() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MoldingEntry[]>([]);
  const [pathaiwals, setPathaiwals] = useState<Person[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [contractorSummary, setContractorSummary] = useState<MoldingContractorSummary | null>(null);
  const [todayTotal, setTodayTotal] = useState(0);
  const [periodTotals, setPeriodTotals] = useState<MoldingPeriodTotals | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [editingEntry, setEditingEntry] = useState<MoldingEntry | null>(null);
  const [openContractorId, setOpenContractorId] = useState<string | null>(null);
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);
  const [showAddThekedar, setShowAddThekedar] = useState(false);
  const [form, setForm] = useState({ workerId: "", bricksCount: "", ratePerThousand: "", damagedCount: "", damageFault: "", washedOut: false });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [entriesData, workers, contractorsData, today, periods, summary] = await Promise.all([
      api.molding.list(),
      api.people.list("WORKER"),
      api.people.list("LABOUR_CONTRACTOR"),
      api.molding.today(),
      api.molding.periodTotals(),
      api.molding.contractorSummary(),
    ]);
    setEntries(entriesData);
    setPathaiwals(workers);
    setContractors(contractorsData);
    setTodayTotal(today.total);
    setPeriodTotals(periods);
    setContractorSummary(summary);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("molding:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(entries, 10);

  const contractorNameByWorkerId = new Map(
    pathaiwals.filter((w) => w.contractorId).map((w) => [w._id, contractors.find((c) => c._id === w.contractorId)?.name])
  );

  function openLedgerFor(personId: string) {
    const person = pathaiwals.find((p) => p._id === personId) ?? contractors.find((p) => p._id === personId);
    if (person) setLedgerFor(person);
  }

  function handleWorkerChange(workerId: string) {
    const worker = pathaiwals.find((w) => w._id === workerId);
    setForm((f) => ({
      ...f,
      workerId,
      ratePerThousand: worker?.ratePerThousand ? String(worker.ratePerThousand) : f.ratePerThousand,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.workerId || !form.bricksCount || !form.ratePerThousand) return;
    setLoading(true);
    try {
      await api.molding.create({
        workerId: form.workerId,
        bricksCount: Number(form.bricksCount),
        ratePerThousand: Number(form.ratePerThousand),
        damagedCount: form.damagedCount ? Number(form.damagedCount) : undefined,
        damageFault: form.damagedCount && form.damageFault ? (form.damageFault as "LABOURER" | "CONTRACTOR" | "OTHER") : undefined,
        washedOut: form.washedOut,
      });
      setForm({ workerId: "", bricksCount: "", ratePerThousand: "", damagedCount: "", damageFault: "", washedOut: false });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  if (openContractorId) {
    return <ContractorDetailPage contractorId={openContractorId} onBack={() => setOpenContractorId(null)} />;
  }

  if (openWorkerId) {
    return <LaborDetailPage workerId={openWorkerId} onBack={() => setOpenWorkerId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PeriodStatCard
          label={t("molding.todaysMolding")}
          value={todayTotal}
          subtitle={t("molding.kacchiBricksMolded")}
          icon={Hammer}
          tone="text-series-2"
        />
        <PeriodStatCard
          label={t("molding.weeklyMolding")}
          value={periodTotals?.week ?? 0}
          subtitle={t("molding.last7DaysKacchi")}
          icon={Hammer}
          tone="text-series-3"
        />
        <PeriodStatCard
          label={t("molding.monthlyMolding")}
          value={periodTotals?.month ?? 0}
          subtitle={t("molding.last30DaysKacchi")}
          icon={Hammer}
          tone="text-series-6"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PeriodStatCard
          label={t("molding.todaysDamaged")}
          value={periodTotals?.todayDamaged ?? 0}
          subtitle={t("molding.rawBricksDamagedToday")}
          icon={AlertTriangle}
          critical
        />
        <PeriodStatCard
          label={t("molding.weeklyDamaged")}
          value={periodTotals?.weekDamaged ?? 0}
          subtitle={t("molding.last7Days")}
          icon={AlertTriangle}
          critical
        />
        <PeriodStatCard
          label={t("molding.monthlyDamaged")}
          value={periodTotals?.monthDamaged ?? 0}
          subtitle={t("molding.last30Days")}
          icon={AlertTriangle}
          critical
        />
      </div>

      <ContractorSummarySection
        summary={contractorSummary}
        onOpenLedger={openLedgerFor}
        onOpenContractor={setOpenContractorId}
        onOpenWorker={setOpenWorkerId}
        onAddThekedar={() => setShowAddThekedar(true)}
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("molding.logHazriEntry")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.workerId}
              onChange={(e) => handleWorkerChange(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("molding.selectPathaiwal")}</option>
              {pathaiwals.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                  {contractorNameByWorkerId.get(w._id) ? t("molding.underContractorSuffix", { name: contractorNameByWorkerId.get(w._id)! }) : ""}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("molding.bricksMoldedPlaceholder")}
              value={form.bricksCount}
              onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="number"
              placeholder={t("molding.ratePerThousandPlaceholder")}
              value={form.ratePerThousand}
              onChange={(e) => setForm((f) => ({ ...f, ratePerThousand: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              placeholder={t("molding.damagedBricksOptionalPlaceholder")}
              value={form.damagedCount}
              onChange={(e) => setForm((f) => ({ ...f, damagedCount: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            {Number(form.damagedCount) > 0 && (
              <select
                value={form.damageFault}
                onChange={(e) => setForm((f) => ({ ...f, damageFault: e.target.value }))}
                className={cn(inputClass, "col-span-2")}
              >
                <option value="">{t("production.damageFaultPlaceholder")}</option>
                <option value="LABOURER">{t("reports.damageFault.LABOURER")}</option>
                <option value="CONTRACTOR">{t("reports.damageFault.CONTRACTOR")}</option>
                <option value="OTHER">{t("reports.damageFault.OTHER")}</option>
              </select>
            )}
            <label className="col-span-2 flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={form.washedOut}
                onChange={(e) => setForm((f) => ({ ...f, washedOut: e.target.checked }))}
              />
              {t("molding.washedOutByRain")}
            </label>
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("molding.saveEntry")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("molding.noEntriesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("molding.pathaiwalColumn")}</th>
                  <th className="pb-2 font-medium">{t("molding.thekedarColumn")}</th>
                  <th className="pb-2 font-medium">{t("molding.bricksColumn")}</th>
                  <th className="pb-2 font-medium">{t("molding.damagedLabel")}</th>
                  <th className="pb-2 font-medium">{t("molding.rateColumn")}</th>
                  <th className="pb-2 font-medium">{t("molding.wageColumn")}</th>
                  <th className="pb-2 font-medium">{t("common.status")}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => {
                  const workerId = typeof entry.workerId === "object" ? entry.workerId._id : entry.workerId;
                  return (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-primary">
                        {typeof entry.workerId === "object" ? (
                          <button onClick={() => setOpenWorkerId(workerId)} className="hover:underline">
                            {entry.workerId.name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-ink-secondary">{contractorNameByWorkerId.get(workerId) ?? "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums">
                        {entry.damagedCount ? (
                          <span className="text-status-critical">{entry.damagedCount.toLocaleString("en-IN")}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">₹{entry.ratePerThousand}</td>
                      <td className="py-3 tabular-nums text-ink-primary">
                        {entry.washedOut ? "—" : `₹${formatINR((entry.bricksCount / 1000) * entry.ratePerThousand)}`}
                      </td>
                      <td className="py-3">
                        {entry.washedOut ? <Badge variant="critical">{t("molding.washedOutBadge")}</Badge> : <Badge variant="good">{t("molding.paidEntryBadge")}</Badge>}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingEntry(entry)}
                          className="text-ink-muted hover:text-ink-primary"
                          aria-label={t("molding.editEntry")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
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
      {showAddThekedar && (
        <AddPersonModal defaultType="LABOUR_CONTRACTOR" onClose={() => setShowAddThekedar(false)} onCreated={refresh} />
      )}
      {editingEntry && <EditMoldingEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />}
    </div>
  );
}
