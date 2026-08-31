import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { EditStackingEntryModal } from "@/components/stacking/EditStackingEntryModal";
import { OperatorDetailPage } from "@/components/stacking/OperatorDetailPage";
import { StackingContractorDetailPage } from "@/components/stacking/StackingContractorDetailPage";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  Gher,
  PathaiSite,
  Person,
  StackingContractorSummary,
  StackingEntry,
  StackingMode,
  StackingOperatorSummary,
  StackingStage,
  TractorFleetEntry,
} from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function useStageMeta(): Record<StackingStage, { label: string; sublabel: string }> {
  const { t } = useTranslation();
  return {
    TRANSPORT: {
      label: t("stacking.stage1Label"),
      sublabel: t("stacking.stage1Sublabel"),
    },
    CHAMBER_STACKING: {
      label: t("stacking.stage2Label"),
      sublabel: t("stacking.stage2Sublabel"),
    },
  };
}

// Thekedar-wise bharai summary — mirrors Molding.tsx's ContractorSummarySection:
// each contractor's mapped labor gang, deployed vehicles/drivers, combined
// production and ledger balance, click-through to their full profile.
function ContractorSummarySection({
  summary,
  onOpenLedger,
  onOpenContractor,
  onAddThekedar,
}: {
  summary: StackingContractorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenContractor: (contractorId: string) => void;
  onAddThekedar: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink-primary">{t("stacking.contractorWiseHeading")}</h4>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("stacking.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalProductionAllContractors.toLocaleString("en-IN")}</span> {t("stacking.bricksUnit")}
            </p>
          )}
          <Button size="sm" onClick={onAddThekedar}>
            <Plus className="h-4 w-4" /> {t("stacking.newThekedar")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.contractors.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("stacking.noThekedarsAddedStage")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.contractors.map((c) => (
            <Card key={c.contractor.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenContractor(c.contractor.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{c.contractor.name}</p>
                  <p className="text-sm text-ink-muted">
                    {c.laborers.length} {c.laborers.length === 1 ? t("stacking.laborer") : t("stacking.laborers")} · {c.tractorCount}{" "}
                    {c.tractorCount === 1 ? t("stacking.tractor") : t("stacking.tractors")}
                    {c.totalBuggiCount > 0 ? ` · ${c.totalBuggiCount} ${t("stacking.buggisWord")}` : ""}
                    {c.contractor.monthlySalary ? ` · ₹${formatINR(c.contractor.monthlySalary)}/${t("stacking.perMonthWord")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(c.contractor.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("stacking.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{c.totalBricksStacked.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("stacking.bricksUnit")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(c.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("stacking.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${c.balance > 0 ? "text-status-critical" : c.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(c.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{c.balance >= 0 ? t("stacking.dueLabel") : t("stacking.advanceLabel")}</p>
                </div>
              </div>

              {(c.laborers.length > 0 || c.vehicles.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {c.laborers.map((w) => (
                    <span key={w.id} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      {w.name} · {w.bricksStacked.toLocaleString("en-IN")}
                    </span>
                  ))}
                  {c.vehicles.map((v) => (
                    <span key={v.id} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      {v.vehicleType === "TRACTOR" ? `🚜 ${v.vehicleNumber ?? "—"}` : `🛒 × ${v.buggiCount ?? "—"}`}
                      {v.driverName ? ` (${v.driverName})` : ""}
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

// Operator-wise bharai summary — for independent gang heads not mapped
// under any thekedar; each buggi/tractor operator with their combined
// production + ledger balance, click-through to their full profile.
function OperatorSummarySection({
  summary,
  onOpenLedger,
  onOpenOperator,
  onAddOperator,
}: {
  summary: StackingOperatorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenOperator: (operatorId: string) => void;
  onAddOperator: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink-primary">{t("stacking.independentOperatorsHeading")}</h4>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("stacking.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalBricksStackedAllOperators.toLocaleString("en-IN")}</span> {t("stacking.bricksUnit")}
            </p>
          )}
          <Button size="sm" onClick={onAddOperator}>
            <Plus className="h-4 w-4" /> {t("stacking.newOperator")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.operators.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("stacking.noIndependentOperatorsStage")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.operators.map((o) => (
            <Card key={o.operator.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenOperator(o.operator.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{o.operator.name}</p>
                  <p className="text-sm text-ink-muted">
                    {o.tripCount} {o.tripCount === 1 ? t("stacking.trip") : t("stacking.trips")}
                    {o.operator.monthlySalary ? ` · ₹${formatINR(o.operator.monthlySalary)}/${t("stacking.perMonthWord")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(o.operator.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("stacking.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{o.totalBricksStacked.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("stacking.bricksUnit")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(o.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("stacking.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${o.balance > 0 ? "text-status-critical" : o.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(o.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{o.balance >= 0 ? t("stacking.dueLabel") : t("stacking.advanceLabel")}</p>
                </div>
              </div>

              {(o.tractorNumbers.length > 0 || o.totalBuggiCount > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {o.tractorNumbers.map((num) => (
                    <span key={num} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      🚜 {num}
                    </span>
                  ))}
                  {o.totalBuggiCount > 0 && (
                    <span className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      🛒 {o.totalBuggiCount} {t("stacking.buggiTrips")}
                    </span>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// One physical stage of bharai (Transport or Chamber Stacking) — its own
// contractor-wise and independent-operator summaries, scoped to gangs
// tagged with this stage (Person.stackingStage).
function StageSection({
  stage,
  contractorSummary,
  operatorSummary,
  onOpenLedger,
  onOpenContractor,
  onOpenOperator,
  onAddThekedar,
  onAddOperator,
}: {
  stage: StackingStage;
  contractorSummary: StackingContractorSummary | null;
  operatorSummary: StackingOperatorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenContractor: (contractorId: string) => void;
  onOpenOperator: (operatorId: string) => void;
  onAddThekedar: () => void;
  onAddOperator: () => void;
}) {
  const { t } = useTranslation();
  const stageMeta = useStageMeta();
  const meta = stageMeta[stage];
  const scopedContractors = contractorSummary
    ? {
        contractors: contractorSummary.contractors.filter((c) => c.contractor.stackingStage === stage),
        totalProductionAllContractors: contractorSummary.contractors
          .filter((c) => c.contractor.stackingStage === stage)
          .reduce((sum, c) => sum + c.totalBricksStacked, 0),
        totalDamagedAllContractors: contractorSummary.contractors
          .filter((c) => c.contractor.stackingStage === stage)
          .reduce((sum, c) => sum + c.totalDamaged, 0),
      }
    : null;
  const scopedOperators = operatorSummary
    ? {
        operators: operatorSummary.operators.filter((o) => o.operator.stackingStage === stage),
        totalBricksStackedAllOperators: operatorSummary.operators
          .filter((o) => o.operator.stackingStage === stage)
          .reduce((sum, o) => sum + o.totalBricksStacked, 0),
        totalDamagedAllOperators: operatorSummary.operators
          .filter((o) => o.operator.stackingStage === stage)
          .reduce((sum, o) => sum + o.totalDamage, 0),
      }
    : null;

  const stageGrandTotal =
    (scopedContractors?.totalProductionAllContractors ?? 0) + (scopedOperators?.totalBricksStackedAllOperators ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{meta.label}</CardTitle>
        <span className="text-sm text-ink-muted">{meta.sublabel}</span>
      </CardHeader>
      <div className="mb-5 rounded-xl border border-border bg-ink-primary/5 px-4 py-3">
        <p className="text-sm text-ink-muted">
          {stage === "CHAMBER_STACKING" ? t("stacking.totalRawBricksStackedInsideChamber") : t("stacking.totalBricksMovedOutsideChamber")}
        </p>
        <p className="text-2xl font-semibold tabular-nums text-ink-primary">{stageGrandTotal.toLocaleString("en-IN")}</p>
      </div>
      <div className="space-y-5">
        <ContractorSummarySection
          summary={scopedContractors}
          onOpenLedger={onOpenLedger}
          onOpenContractor={onOpenContractor}
          onAddThekedar={onAddThekedar}
        />
        <OperatorSummarySection
          summary={scopedOperators}
          onOpenLedger={onOpenLedger}
          onOpenOperator={onOpenOperator}
          onAddOperator={onAddOperator}
        />
      </div>
    </Card>
  );
}

function TractorFleetSection({ fleet }: { fleet: TractorFleetEntry[] }) {
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedFleet, total } = usePagination(fleet, 10);
  if (fleet.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stacking.tractorFleet")}</CardTitle>
        <span className="text-sm text-ink-muted">{t("stacking.tripsAndBricksByTractor")}</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-sm text-ink-muted">
              <th className="pb-2 font-medium">{t("stacking.tractorColumn")}</th>
              <th className="pb-2 font-medium">{t("stacking.tripsColumn")}</th>
              <th className="pb-2 font-medium">{t("stacking.bricksStackedLabel")}</th>
              <th className="pb-2 font-medium">{t("stacking.operatorsColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedFleet.map((t) => (
              <tr key={t.tractorNumber} className="border-b border-border/60 last:border-0">
                <td className="py-3 font-medium text-ink-primary">{t.tractorNumber}</td>
                <td className="py-3 tabular-nums text-ink-secondary">{t.tripCount}</td>
                <td className="py-3 tabular-nums text-ink-secondary">{t.totalBricksStacked.toLocaleString("en-IN")}</td>
                <td className="py-3 text-ink-secondary">{t.operators.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
      </div>
    </Card>
  );
}

export function Stacking() {
  const { t } = useTranslation();
  const stageMeta = useStageMeta();
  const [ghers, setGhers] = useState<Gher[]>([]);
  const [entries, setEntries] = useState<StackingEntry[]>([]);
  const [gangs, setGangs] = useState<Person[]>([]);
  const [operatorSummary, setOperatorSummary] = useState<StackingOperatorSummary | null>(null);
  const [contractorSummary, setContractorSummary] = useState<StackingContractorSummary | null>(null);
  const [tractorFleet, setTractorFleet] = useState<TractorFleetEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [openOperatorId, setOpenOperatorId] = useState<string | null>(null);
  const [openContractorId, setOpenContractorId] = useState<string | null>(null);
  const [addPersonConfig, setAddPersonConfig] = useState<{ type: "WORKER" | "LABOUR_CONTRACTOR"; stage: StackingStage } | null>(null);
  const [editingEntry, setEditingEntry] = useState<StackingEntry | null>(null);
  const [sites, setSites] = useState<PathaiSite[]>([]);
  const [form, setForm] = useState({
    gherId: "",
    stage: "" as "" | StackingStage,
    gangId: "",
    bricksCount: "",
    damageCount: "",
    damageFault: "",
    qualityRating: "GOOD" as StackingEntry["qualityRating"],
    mode: "" as "" | StackingMode,
    tractorNumber: "",
    buggiCount: "",
    siteId: "",
  });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [ghersData, entriesData, contractors, workers, summary, contractorSummaryData, fleet, sitesData] = await Promise.all([
      api.ghers.list(),
      api.stacking.list(),
      api.people.list("LABOUR_CONTRACTOR"),
      api.people.list("WORKER"),
      api.stacking.operatorSummary(),
      api.stacking.contractorSummary(),
      api.stacking.tractorFleet(),
      api.pathaiSites.list(),
    ]);
    setGhers(ghersData);
    setEntries(entriesData);
    setGangs([...contractors, ...workers]);
    setOperatorSummary(summary);
    setContractorSummary(contractorSummaryData);
    setTractorFleet(fleet);
    setSites(sitesData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("gher:update", () => refresh());
  useKilnEvent("stacking:update", () => refresh());
  useKilnEvent("stackingVehicle:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  function openLedgerFor(personId: string) {
    const person = gangs.find((p) => p._id === personId);
    if (person) setLedgerFor(person);
  }

  function handleStageChange(stage: "" | StackingStage) {
    setForm((f) => ({
      ...f,
      stage,
      gangId: "",
      mode: stage === "CHAMBER_STACKING" ? "" : f.mode,
      tractorNumber: stage === "CHAMBER_STACKING" ? "" : f.tractorNumber,
      buggiCount: stage === "CHAMBER_STACKING" ? "" : f.buggiCount,
      siteId: stage === "CHAMBER_STACKING" ? "" : f.siteId,
    }));
  }

  const gangsForStage = form.stage ? gangs.filter((g) => g.stackingStage === form.stage) : [];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.gherId || !form.stage || !form.gangId || !form.bricksCount) return;
    setLoading(true);
    try {
      await api.stacking.create({
        gherId: form.gherId,
        gangId: form.gangId,
        stage: form.stage,
        bricksCount: Number(form.bricksCount),
        damageCount: form.damageCount ? Number(form.damageCount) : undefined,
        damageFault: form.damageCount && form.damageFault ? (form.damageFault as "LABOURER" | "CONTRACTOR" | "OTHER") : undefined,
        qualityRating: form.qualityRating,
        mode: form.mode || undefined,
        tractorNumber: form.mode === "TRACTOR" ? form.tractorNumber || undefined : undefined,
        buggiCount: form.mode === "BUGGI" && form.buggiCount ? Number(form.buggiCount) : undefined,
        siteId: form.stage === "TRANSPORT" ? form.siteId || undefined : undefined,
      });
      setForm({
        gherId: "",
        stage: "",
        gangId: "",
        bricksCount: "",
        damageCount: "",
        damageFault: "",
        qualityRating: "GOOD",
        mode: "",
        tractorNumber: "",
        buggiCount: "",
        siteId: "",
      });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  // usePagination must run on every render, before either early return
  // below -- calling it after them meant it (and its internal hooks) got
  // skipped entirely whenever openContractorId/openOperatorId was set,
  // which is exactly what "Rendered fewer hooks than expected" (React
  // error #300) means: React crashes the whole tree the moment a render
  // calls fewer hooks than the previous one did.
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(entries, 10);

  if (openContractorId) {
    return <StackingContractorDetailPage contractorId={openContractorId} onBack={() => setOpenContractorId(null)} />;
  }

  if (openOperatorId) {
    return <OperatorDetailPage operatorId={openOperatorId} onBack={() => setOpenOperatorId(null)} />;
  }

  const unassigned = gangs.filter((g) => !g.stackingStage);

  return (
    <div className="space-y-4">
      <StageSection
        stage="TRANSPORT"
        contractorSummary={contractorSummary}
        operatorSummary={operatorSummary}
        onOpenLedger={openLedgerFor}
        onOpenContractor={setOpenContractorId}
        onOpenOperator={setOpenOperatorId}
        onAddThekedar={() => setAddPersonConfig({ type: "LABOUR_CONTRACTOR", stage: "TRANSPORT" })}
        onAddOperator={() => setAddPersonConfig({ type: "WORKER", stage: "TRANSPORT" })}
      />

      <StageSection
        stage="CHAMBER_STACKING"
        contractorSummary={contractorSummary}
        operatorSummary={operatorSummary}
        onOpenLedger={openLedgerFor}
        onOpenContractor={setOpenContractorId}
        onOpenOperator={setOpenOperatorId}
        onAddThekedar={() => setAddPersonConfig({ type: "LABOUR_CONTRACTOR", stage: "CHAMBER_STACKING" })}
        onAddOperator={() => setAddPersonConfig({ type: "WORKER", stage: "CHAMBER_STACKING" })}
      />

      {unassigned.length > 0 && (
        <p className="text-sm text-ink-muted">
          {unassigned.length} {unassigned.length === 1 ? t("stacking.thekedarOperatorSingular") : t("stacking.thekedarOperatorPlural")}{" "}
          {t("stacking.notYetAssignedToStage")} {unassigned.map((g) => g.name).join(", ")} {t("stacking.setStageFromProfile")}
        </p>
      )}

      <TractorFleetSection fleet={tractorFleet} />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("stacking.logBharaiEntry")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.stage}
              onChange={(e) => handleStageChange(e.target.value as "" | StackingStage)}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("stacking.stagePlaceholder")}</option>
              <option value="TRANSPORT">{stageMeta.TRANSPORT.label}</option>
              <option value="CHAMBER_STACKING">{stageMeta.CHAMBER_STACKING.label}</option>
            </select>
            <select
              required
              value={form.gherId}
              onChange={(e) => setForm((f) => ({ ...f, gherId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("stacking.chamberPlaceholder")}</option>
              {ghers.map((g) => (
                <option key={g._id} value={g._id}>
                  {t("stacking.gherWord")} #{g.number}
                </option>
              ))}
            </select>
            <select
              required
              disabled={!form.stage}
              value={form.gangId}
              onChange={(e) => setForm((f) => ({ ...f, gangId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{form.stage ? t("stacking.gangJamadaarPlaceholder") : t("stacking.pickStageFirstPlaceholder")}</option>
              {gangsForStage.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("stacking.bricksStackedPlaceholder")}
              value={form.bricksCount}
              onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("stacking.damagedBrokenCountPlaceholder")}
              value={form.damageCount}
              onChange={(e) => setForm((f) => ({ ...f, damageCount: e.target.value }))}
              className={inputClass}
            />
            {Number(form.damageCount) > 0 && (
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
            <select
              value={form.qualityRating}
              onChange={(e) => setForm((f) => ({ ...f, qualityRating: e.target.value as StackingEntry["qualityRating"] }))}
              className={inputClass}
            >
              <option value="GOOD">{t("stacking.goodSetting")}</option>
              <option value="AVERAGE">{t("stacking.averageSetting")}</option>
              <option value="POOR">{t("stacking.poorSetting")}</option>
            </select>
            {form.stage === "TRANSPORT" && (
              <>
                <select
                  value={form.mode}
                  onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as "" | StackingMode }))}
                  className={cn(inputClass, "col-span-2")}
                >
                  <option value="">{t("stacking.modeNotSet")}</option>
                  <option value="BUGGI">{t("stacking.buggiOption")}</option>
                  <option value="TRACTOR">{t("stacking.tractorOption")}</option>
                </select>
                {form.mode === "TRACTOR" && (
                  <input
                    placeholder={t("stacking.tractorNumberPlaceholder")}
                    value={form.tractorNumber}
                    onChange={(e) => setForm((f) => ({ ...f, tractorNumber: e.target.value }))}
                    className={cn(inputClass, "col-span-2")}
                  />
                )}
                {form.mode === "BUGGI" && (
                  <input
                    type="number"
                    placeholder={t("stacking.numberOfBuggisEngagedPlaceholder")}
                    value={form.buggiCount}
                    onChange={(e) => setForm((f) => ({ ...f, buggiCount: e.target.value }))}
                    className={cn(inputClass, "col-span-2")}
                  />
                )}
                {sites.length > 0 && (
                  <select
                    value={form.siteId}
                    onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
                    className={cn(inputClass, "col-span-2")}
                  >
                    <option value="">{t("pathaiSite.transportedFromSiteOptional")}</option>
                    {sites.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("stacking.saveEntry")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("stacking.noBharaiEntriesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("stacking.chamberColumn")}</th>
                  <th className="pb-2 font-medium">{t("stacking.gangColumn")}</th>
                  <th className="pb-2 font-medium">{t("stacking.stageColumn")}</th>
                  <th className="pb-2 font-medium">{t("stacking.modeColumn")}</th>
                  <th className="pb-2 font-medium">{t("stacking.bricksColumn")}</th>
                  <th className="pb-2 font-medium">{t("stacking.damagedLabel")}</th>
                  <th className="pb-2 font-medium">{t("stacking.qualityColumn")}</th>
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
                      <td className="py-3 text-ink-secondary">
                        {entry.stage ? (entry.stage === "TRANSPORT" ? t("stacking.stage1Bare") : t("stacking.stage2Bare")) : "—"}
                      </td>
                      <td className="py-3 text-ink-secondary">
                        {entry.mode === "TRACTOR" ? `🚜 ${entry.tractorNumber ?? "—"}` : entry.mode === "BUGGI" ? `🛒 × ${entry.buggiCount ?? "—"}` : "—"}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                      <td className={cn("py-3 tabular-nums", entry.damageCount > 0 ? "text-status-critical" : "text-ink-muted")}>
                        {entry.damageCount}
                      </td>
                      <td className="py-3 text-ink-secondary">
                        {entry.qualityRating === "GOOD"
                          ? t("stacking.qualityGood")
                          : entry.qualityRating === "AVERAGE"
                          ? t("stacking.qualityAverage")
                          : t("stacking.qualityPoor")}
                      </td>
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
      {addPersonConfig && (
        <AddPersonModal
          defaultType={addPersonConfig.type}
          defaultStackingStage={addPersonConfig.stage}
          onClose={() => setAddPersonConfig(null)}
          onCreated={refresh}
        />
      )}
      {editingEntry && (
        <EditStackingEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
