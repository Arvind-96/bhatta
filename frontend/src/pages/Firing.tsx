import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Flame, Layers, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { LedgerModal } from "@/components/people/LedgerModal";
import { FitterDetailPage } from "@/components/firing/FitterDetailPage";
import { PakayiContractorDetailPage } from "@/components/firing/PakayiContractorDetailPage";
import { PakayiOperatorDetailPage } from "@/components/firing/PakayiOperatorDetailPage";
import { GherMap } from "@/components/firing/GherMap";
import { BrickLineItemsEditor, emptyLineItemRow, isValidLineItemRow, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import type {
  BrickCategory,
  ChamberCostReport,
  ChamberGrading,
  ChamberOverviewEntry,
  FireRoundSpeed,
  FiringShift,
  FitterRosterSummary,
  FuelLog,
  FuelLogPeriodTotals,
  FuelType,
  Gher,
  GherStatus,
  IncidentType,
  KilnIncident,
  PakayiContractorSummary,
  PakayiOperatorSummary,
  Person,
  ShiftType,
} from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const FIRING_TEAM_TARGET = 6;

function useIncidentLabels(t: (key: string) => string): Record<IncidentType, string> {
  return {
    CRACK_LEAKAGE: t("firing.incidentCrackLeakage"),
    WEATHER_FLOODING: t("firing.incidentWeatherFlooding"),
    ELECTRICAL_FAILURE: t("firing.incidentElectricalFailure"),
    OTHER: t("firing.incidentOther"),
  };
}

function useGhers() {
  const [ghers, setGhers] = useState<Gher[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  useEffect(() => {
    if (!activeKilnId) return;
    api.ghers.list().then(setGhers).catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("gher:update", () => {
    api.ghers.list().then(setGhers).catch(console.error);
  });

  return ghers;
}

// Per-chamber current-cycle progress (bricks loaded, fuel fed, bricks
// unloaded) — the live data behind the chamber board below. Refetched on
// every event that could change any of those three figures for any
// chamber, not just gher:update itself.
function useChamberOverview() {
  const [overview, setOverview] = useState<ChamberOverviewEntry[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setOverview(await api.ghers.overview());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId]);

  useKilnEvent("gher:update", () => refresh());
  useKilnEvent("stacking:update", () => refresh());
  useKilnEvent("fuelLog:update", () => refresh());
  useKilnEvent("nikasi:update", () => refresh());
  useKilnEvent("grading:update", () => refresh());

  return overview;
}

// The kiln's own Brick Categories, live — same list Stock.tsx manages,
// shown here too (not just usable in the Grading form's picker) so the
// admin can see current stock without leaving the Firing page, and any
// category added later shows up here automatically.
function useBrickCategories() {
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setCategories(await api.brickCategories.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId]);

  useKilnEvent("brickCategory:update", () => refresh());

  return categories;
}

const NEXT_STATUS: Record<GherStatus, GherStatus> = {
  EMPTY: "STACKING",
  STACKING: "FIRING",
  FIRING: "READY",
  READY: "UNLOADING",
  UNLOADING: "EMPTY",
};

function useChamberStatusLegend(): { status: GherStatus; label: string }[] {
  const { t } = useTranslation();
  return [
    { status: "EMPTY", label: t("stacking.statusEmpty") },
    { status: "STACKING", label: t("stacking.statusBharaiInProgress") },
    { status: "FIRING", label: t("stacking.statusFiring") },
    { status: "READY", label: t("firing.statusReadyToUnload") },
    { status: "UNLOADING", label: t("firing.statusUnloading") },
  ];
}

const STATUS_LEGEND_COLOR: Record<GherStatus, string> = {
  EMPTY: "var(--ink-muted)",
  STACKING: "var(--status-warning)",
  FIRING: "var(--status-serious)",
  READY: "var(--status-good)",
  UNLOADING: "var(--series-3)",
};

// The gang picker shared by the Stacking and Nikasi quick-log forms below —
// same three person types both modules' own backend gates accept
// (stacking.service.ts / nikasi.service.ts's assertPersonOfType call).
function useGangOptions() {
  const [people, setPeople] = useState<Person[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [contractors, workers, helpers] = await Promise.all([
      api.people.list("LABOUR_CONTRACTOR"),
      api.people.list("WORKER"),
      api.people.list("HELPER"),
    ]);
    setPeople([...contractors, ...workers, ...helpers]);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  return people;
}

interface ChamberActivityItem {
  id: string;
  type: "STACKING" | "FUEL" | "NIKASI" | "GRADING" | "FIRING_SHIFT" | "INCIDENT";
  date: string;
  label: string;
  quantityLabel: string;
}

// This chamber's own recent entries across every module that touches a
// gher — the actual cross-module linkage the chamber board never had
// before (selecting a chamber used to change nothing else on the page).
// Stacking/Nikasi are filtered server-side (?gherId=); FuelLog/
// ChamberGrading have no gherId filter on their list endpoints (they're
// windowed by days instead), so those two are filtered client-side from
// the same bounded recent-days list their own tabs already use.
function useChamberActivity(gherId: string) {
  const [items, setItems] = useState<ChamberActivityItem[]>([]);

  async function refresh() {
    if (!gherId) {
      setItems([]);
      return;
    }
    const [stackingEntries, nikasiEntries, fuelLogs, gradings, shifts, incidents] = await Promise.all([
      api.stacking.list({ gherId }),
      api.nikasi.list({ gherId }),
      api.fuelLogs.list(),
      api.chamberGradings.list(),
      api.firingShifts.list(),
      api.incidents.list(),
    ]);
    const gherIdOf = (ref: { _id: string } | string | undefined) => (typeof ref === "object" ? ref?._id : ref);
    const merged: ChamberActivityItem[] = [
      ...stackingEntries.map((e) => ({ id: e._id, type: "STACKING" as const, date: e.date, label: "Bharai", quantityLabel: `${e.bricksCount.toLocaleString("en-IN")} bricks` })),
      ...nikasiEntries.map((e) => ({ id: e._id, type: "NIKASI" as const, date: e.date, label: "Nikasi", quantityLabel: `${e.bricksCount.toLocaleString("en-IN")} bricks` })),
      ...fuelLogs.filter((l) => gherIdOf(l.gherId) === gherId).map((l) => ({ id: l._id, type: "FUEL" as const, date: l.date, label: l.fuelType, quantityLabel: `${l.quantityKg.toLocaleString("en-IN")} kg` })),
      ...gradings.filter((g) => gherIdOf(g.gherId) === gherId).map((g) => ({ id: g._id, type: "GRADING" as const, date: g.date, label: "Grading", quantityLabel: `${g.totalOutput.toLocaleString("en-IN")} bricks` })),
      // Bug fix: these two record types carry a chamber id and are
      // logically "this chamber's activity" too, but were never wired
      // into the feed despite both having the foreign key.
      ...shifts.filter((s) => gherIdOf(s.gherId) === gherId).map((s) => ({ id: s._id, type: "FIRING_SHIFT" as const, date: s.date, label: s.shiftType, quantityLabel: s.overtimeHours > 0 ? `${s.overtimeHours}h OT` : "" })),
      ...incidents.filter((i) => gherIdOf(i.gherId) === gherId).map((i) => ({ id: i._id, type: "INCIDENT" as const, date: i.date, label: i.type, quantityLabel: i.repairCost > 0 ? `₹${i.repairCost.toLocaleString("en-IN")}` : "" })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setItems(merged.slice(0, 15));
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gherId]);

  useKilnEvent("stacking:update", () => refresh());
  useKilnEvent("nikasi:update", () => refresh());
  useKilnEvent("fuelLog:update", () => refresh());
  useKilnEvent("grading:update", () => refresh());
  useKilnEvent("firingShift:update", () => refresh());
  useKilnEvent("incident:update", () => refresh());

  return items;
}

const ACTIVITY_TYPE_LABEL_KEY: Record<ChamberActivityItem["type"], string> = {
  STACKING: "firing.activityStacking",
  FUEL: "firing.activityFuel",
  NIKASI: "firing.activityNikasi",
  GRADING: "firing.activityGrading",
  FIRING_SHIFT: "firing.activityFiringShift",
  INCIDENT: "firing.activityIncident",
};

// One chamber's own detail — status + an explicit advance action, its
// current-cycle progress and cost, three quick-log forms that post
// straight against THIS chamber (previously the only way to log anything
// against a chamber was to leave the board entirely, go find the right
// tab, and pick the chamber again from a dropdown), and its own recent
// activity across every module. Selected via the grid above rather than
// rendering this for every chamber at once, so the panel stays usable
// whether the kiln has 20 chambers or 200.
function ChamberDetailPanel({ entry, gangOptions, fuelTypes, onAdvance }: { entry: ChamberOverviewEntry; gangOptions: Person[]; fuelTypes: FuelType[]; onAdvance: (gher: Gher) => void }) {
  const { t } = useTranslation();
  const [cost, setCost] = useState<ChamberCostReport | null>(null);
  const { gher, bricksLoadedThisCycle, fuelThisCycle, bricksUnloadedThisCycle } = entry;
  const activity = useChamberActivity(gher._id);

  const [openForm, setOpenForm] = useState<"" | "stacking" | "fuel" | "nikasi">("");
  const [stackingForm, setStackingForm] = useState({ gangId: "", bricksCount: "" });
  const [fuelForm, setFuelForm] = useState({ fuelType: "", quantityKg: "" });
  const [nikasiForm, setNikasiForm] = useState({ gangId: "", bricksCount: "" });
  const [saving, setSaving] = useState(false);
  const [quickLogError, setQuickLogError] = useState("");

  function refreshCost() {
    api.financialReports.chamberCost(gher._id).then(setCost).catch(console.error);
  }

  useEffect(refreshCost, [gher._id]);
  // Bug fix: this tile used to only refetch when the selected chamber
  // itself changed — its three sibling stat tiles in this same panel all
  // update live from these events (see useChamberActivity above), but
  // logging fuel/stacking for the currently-open chamber via this panel's
  // own quick-log forms visibly bumped those while leaving ₹/brick stale.
  useKilnEvent("stacking:update", refreshCost);
  useKilnEvent("fuelLog:update", refreshCost);
  useKilnEvent("grading:update", refreshCost);

  useEffect(() => {
    setOpenForm("");
  }, [gher._id]);

  // Bug fix (D2): these three quick-log handlers used to have no catch at
  // all — a rejection (a validation failure, a chamber-status guard) was a
  // fully silent unhandled promise rejection, the form staying open with
  // no indication anything went wrong.
  async function submitStacking(e: FormEvent) {
    e.preventDefault();
    if (!stackingForm.gangId || !stackingForm.bricksCount) return;
    setQuickLogError("");
    setSaving(true);
    try {
      await api.stacking.create({ gherId: gher._id, gangId: stackingForm.gangId, stage: "STOCK_TO_CHAMBER", bricksCount: Number(stackingForm.bricksCount) });
      setStackingForm({ gangId: "", bricksCount: "" });
      setOpenForm("");
    } catch (err) {
      setQuickLogError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  async function submitFuel(e: FormEvent) {
    e.preventDefault();
    if (!fuelForm.fuelType || !fuelForm.quantityKg) return;
    setQuickLogError("");
    setSaving(true);
    try {
      await api.fuelLogs.create({ gherId: gher._id, fuelType: fuelForm.fuelType, quantityKg: Number(fuelForm.quantityKg) });
      setFuelForm({ fuelType: "", quantityKg: "" });
      setOpenForm("");
    } catch (err) {
      setQuickLogError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  async function submitNikasi(e: FormEvent) {
    e.preventDefault();
    if (!nikasiForm.gangId || !nikasiForm.bricksCount) return;
    setQuickLogError("");
    setSaving(true);
    try {
      await api.nikasi.create({ gherId: gher._id, gangId: nikasiForm.gangId, bricksCount: Number(nikasiForm.bricksCount) });
      setNikasiForm({ gangId: "", bricksCount: "" });
      setOpenForm("");
    } catch (err) {
      setQuickLogError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-primary">{t("firing.chamberNumberLabel", { number: gher.number })}</h4>
        <div className="flex items-center gap-2">
          <Badge variant={gher.status === "FIRING" ? "critical" : gher.status === "READY" ? "good" : gher.status === "EMPTY" ? "neutral" : "warning"}>
            {gher.status}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => onAdvance(gher)}>
            {t("firing.advanceTo", { status: NEXT_STATUS[gher.status] })} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">{bricksLoadedThisCycle.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("firing.bricksLoadedThisCycleLabel")}</p>
        </div>
        <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">{fuelThisCycle.totalKg.toLocaleString("en-IN")} kg</p>
          <p className="text-sm text-ink-muted">{t("firing.fuelThisCycleLabel")}</p>
        </div>
        <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">{bricksUnloadedThisCycle.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("firing.bricksUnloadedThisCycleLabel")}</p>
        </div>
        <div className="rounded-xl border border-series-1/30 bg-series-1/5 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-series-1">{cost?.costPerBrick != null ? `₹${cost.costPerBrick}` : "—"}</p>
          <p className="text-sm text-ink-muted">{t("firing.costPerBrickLabel")}</p>
        </div>
      </div>
      {Object.keys(fuelThisCycle.byFuelType).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(fuelThisCycle.byFuelType).map(([type, kg]) => (
            <span key={type} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
              {type}: {kg.toLocaleString("en-IN")} kg
            </span>
          ))}
        </div>
      )}
      {cost && (
        <p className="mt-3 text-sm text-ink-muted">
          {t("firing.chamberCostBreakdown", { fuel: formatINR(cost.fuelCost), stacking: formatINR(cost.stackingCost), total: formatINR(cost.totalCost) })}
        </p>
      )}
      {cost && cost.fuelTypesMissingCost.length > 0 && (
        <p className="mt-1.5 text-xs text-status-critical">
          {t("firing.fuelCostMissingWarning", { types: cost.fuelTypesMissingCost.join(", ") })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" variant={openForm === "stacking" ? "primary" : "outline"} onClick={() => setOpenForm((f) => (f === "stacking" ? "" : "stacking"))}>
          <Plus className="h-3.5 w-3.5" /> {t("firing.logBharaiForChamber")}
        </Button>
        <Button size="sm" variant={openForm === "fuel" ? "primary" : "outline"} onClick={() => setOpenForm((f) => (f === "fuel" ? "" : "fuel"))} disabled={fuelTypes.length === 0}>
          <Plus className="h-3.5 w-3.5" /> {t("firing.logFuelForChamber")}
        </Button>
        <Button size="sm" variant={openForm === "nikasi" ? "primary" : "outline"} onClick={() => setOpenForm((f) => (f === "nikasi" ? "" : "nikasi"))}>
          <Plus className="h-3.5 w-3.5" /> {t("firing.logNikasiForChamber")}
        </Button>
      </div>

      {quickLogError && <p className="mt-2 text-sm text-status-critical">{quickLogError}</p>}

      {openForm === "stacking" && (
        <form onSubmit={submitStacking} className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-ink-primary/[0.02] p-3">
          <select required value={stackingForm.gangId} onChange={(e) => setStackingForm((f) => ({ ...f, gangId: e.target.value }))} className={cn(inputClass, "col-span-2")}>
            <option value="">{t("firing.gangPlaceholder")}</option>
            {gangOptions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <input required type="number" placeholder={t("firing.bricksLoadedThisCycleLabel")} value={stackingForm.bricksCount} onChange={(e) => setStackingForm((f) => ({ ...f, bricksCount: e.target.value }))} className={inputClass} />
          <Button type="submit" size="sm" disabled={saving}>
            {t("common.save")}
          </Button>
        </form>
      )}

      {openForm === "fuel" && (
        <form onSubmit={submitFuel} className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-ink-primary/[0.02] p-3">
          <select required value={fuelForm.fuelType} onChange={(e) => setFuelForm((f) => ({ ...f, fuelType: e.target.value }))} className={inputClass}>
            <option value="">{t("firing.fuelTypePlaceholder")}</option>
            {fuelTypes.map((ft) => (
              <option key={ft._id} value={ft.name}>
                {ft.name}
              </option>
            ))}
          </select>
          <input required type="number" placeholder={t("firing.quantityFedKg")} value={fuelForm.quantityKg} onChange={(e) => setFuelForm((f) => ({ ...f, quantityKg: e.target.value }))} className={inputClass} />
          <Button type="submit" size="sm" disabled={saving} className="col-span-2">
            {t("common.save")}
          </Button>
        </form>
      )}

      {openForm === "nikasi" && (
        <form onSubmit={submitNikasi} className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-ink-primary/[0.02] p-3">
          <select required value={nikasiForm.gangId} onChange={(e) => setNikasiForm((f) => ({ ...f, gangId: e.target.value }))} className={cn(inputClass, "col-span-2")}>
            <option value="">{t("firing.gangPlaceholder")}</option>
            {gangOptions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <input required type="number" placeholder={t("firing.bricksUnloadedThisCycleLabel")} value={nikasiForm.bricksCount} onChange={(e) => setNikasiForm((f) => ({ ...f, bricksCount: e.target.value }))} className={inputClass} />
          <Button type="submit" size="sm" disabled={saving}>
            {t("common.save")}
          </Button>
        </form>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.chamberActivityHeading")}</p>
        {activity.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">{t("firing.noChamberActivityYet")}</p>
        ) : (
          <div className="space-y-1">
            {activity.map((a) => (
              <div key={`${a.type}-${a.id}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-sm">
                <span className="text-ink-secondary">
                  <Badge variant="neutral">{t(ACTIVITY_TYPE_LABEL_KEY[a.type])}</Badge> {a.label}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  {new Date(a.date).toLocaleDateString("en-IN")}
                  <span className="font-medium tabular-nums text-ink-primary">{a.quantityLabel}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// The "Kiln Chambers (Gher)" board — moved here from Stacking.tsx (Firing
// is where loading/firing/unloading actually converge for a chamber, not
// just the stacking stage), plus the per-chamber live figures Stacking's
// version never showed: bricks loaded, fuel consumed, bricks unloaded this
// cycle, and — via the picker below the map — a full cost breakdown down
// to ₹/brick for whichever chamber the admin selects.
function ChamberBoard() {
  const { t } = useTranslation();
  const overview = useChamberOverview();
  const categories = useBrickCategories();
  const statusLegend = useChamberStatusLegend();
  const gangOptions = useGangOptions();
  const fuelTypes = useFuelTypes();
  const [selectedGherId, setSelectedGherId] = useState("");

  async function handleAdvance(gher: Gher) {
    await api.ghers.updateStatus(gher._id, NEXT_STATUS[gher.status]);
  }

  const ghers = overview.map((o) => o.gher);
  const inProgressBricks = overview.filter((o) => o.gher.status !== "EMPTY").reduce((sum, o) => sum + o.bricksLoadedThisCycle, 0);
  const totalFinishedStock = categories.reduce((sum, c) => sum + c.quantity, 0);
  const selected = overview.find((o) => o.gher._id === selectedGherId) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("stacking.kilnChambersGher")}</CardTitle>
          <span className="text-sm text-ink-muted">{t("firing.clickChamberToSelect")}</span>
        </CardHeader>
        <div className="flex flex-col items-center gap-4">
          <GherMap ghers={ghers} selectedId={selectedGherId} onSelect={(g) => setSelectedGherId(g._id)} />
          <div className="flex flex-wrap justify-center gap-4">
            {statusLegend.map(({ status, label }) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_LEGEND_COLOR[status] }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-series-4/15 text-series-4">
              <Layers className="h-4 w-4" />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums text-ink-primary">{inProgressBricks.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("firing.rawBricksInChambersLabel")}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-series-1/15 text-series-1">
              <Warehouse className="h-4 w-4" />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums text-ink-primary">{totalFinishedStock.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("firing.totalFinishedStockLabel")}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stock.brickCategoriesHeading")}</h4>
        {categories.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">{t("stock.noCategoriesYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span key={c._id} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                {c.grade ? `${c.category} (${c.grade})` : c.category}: <span className="font-medium text-ink-primary">{c.quantity.toLocaleString("en-IN")}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <select value={selectedGherId} onChange={(e) => setSelectedGherId(e.target.value)} className={cn(inputClass, "w-full sm:max-w-xs")}>
          <option value="">{t("firing.selectChamberForDetailPlaceholder")}</option>
          {ghers.map((g) => (
            <option key={g._id} value={g._id}>
              {t("firing.gherNumberStatus", { number: g.number, status: g.status })}
            </option>
          ))}
        </select>
      </Card>

      {selected && <ChamberDetailPanel entry={selected} gangOptions={gangOptions} fuelTypes={fuelTypes} onAdvance={handleAdvance} />}
    </div>
  );
}

function useFuelTypes() {
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setFuelTypes(await api.fuelTypes.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelType:update", () => refresh());

  return fuelTypes;
}

const PERIOD_COLUMNS: { key: keyof FuelLogPeriodTotals; labelKey: string }[] = [
  { key: "today", labelKey: "common.today" },
  { key: "week", labelKey: "common.thisWeek" },
  { key: "month", labelKey: "common.thisMonth" },
  { key: "year", labelKey: "common.thisYear" },
];

// The Pakayi (Firing) page's fuel-usage-at-a-glance — how much of each fuel
// was fed into chambers today / this week / this month / this year, kept at
// the very top of the page so it's visible no matter which tab is open.
// Reads the same FuelLog entries the Fuel page's "Daily Feeding" tab writes.
function FuelUsageSummary({ fuelTypes }: { fuelTypes: FuelType[] }) {
  const { t } = useTranslation();
  const [totals, setTotals] = useState<FuelLogPeriodTotals | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setTotals(await api.fuelLogs.periodTotals());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelLog:update", () => refresh());

  if (!totals || fuelTypes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("firing.fuelUsedForFiring")}</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-sm text-ink-muted">
              <th className="pb-2 font-medium">{t("firing.fuelColumnHeader")}</th>
              {PERIOD_COLUMNS.map((c) => (
                <th key={c.key} className="pb-2 font-medium text-right">
                  {t(c.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fuelTypes.map((ft) => (
              <tr key={ft._id} className="border-b border-border/60 last:border-0">
                <td className="py-2 text-ink-primary">{ft.name}</td>
                {PERIOD_COLUMNS.map((c) => (
                  <td key={c.key} className="py-2 text-right tabular-nums text-ink-secondary">
                    {(totals[c.key].byFuelType[ft.name] ?? 0).toLocaleString("en-IN")} {t("firing.kg")}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 text-ink-primary">{t("common.total")}</td>
              {PERIOD_COLUMNS.map((c) => (
                <td key={c.key} className="py-2 text-right tabular-nums text-ink-primary">
                  {totals[c.key].total.toLocaleString("en-IN")} {t("firing.kg")}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// The Firing page's own fuel-usage log form + history — reuses FuelLog (the
// same model Fuel.tsx's "Daily Feeding" tab writes to), so admins can log
// which fuel was fed into which chamber right from Pakayi without switching
// pages, and it's the same data driving FuelUsageSummary above.
function FuelUsageTab({ fuelTypes }: { fuelTypes: FuelType[] }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const ghers = useGhers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ gherId: "", fuelType: "", quantityKg: "" });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { page, setPage, pageCount, pageItems: pagedLogs, total } = usePagination(logs, 10);
  // Bug fix: Fuel Log entries are fully CRUD on the backend, but this
  // history exposed no edit/delete button at all despite the API existing.
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ gherId: "", fuelType: "", quantityKg: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [logError, setLogError] = useState("");

  function startEditLog(l: FuelLog) {
    setLogError("");
    setEditingLogId(l._id);
    setEditForm({
      gherId: typeof l.gherId === "object" ? l.gherId._id : l.gherId,
      fuelType: l.fuelType,
      quantityKg: String(l.quantityKg),
    });
  }

  async function saveEditLog(e: FormEvent) {
    e.preventDefault();
    if (!editingLogId || !editForm.gherId || !editForm.fuelType || !editForm.quantityKg) return;
    setLogError("");
    setSavingEdit(true);
    try {
      await api.fuelLogs.update(editingLogId, {
        gherId: editForm.gherId,
        fuelType: editForm.fuelType,
        quantityKg: Number(editForm.quantityKg),
      });
      setEditingLogId(null);
      await refresh();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteLog(id: string) {
    if (!confirm(t("firing.confirmDeleteFuelLog"))) return;
    setLogError("");
    setDeletingLogId(id);
    try {
      await api.fuelLogs.remove(id);
      await refresh();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setDeletingLogId(null);
    }
  }

  useEffect(() => {
    if (!form.fuelType && fuelTypes.length > 0) {
      setForm((f) => ({ ...f, fuelType: fuelTypes[0].name }));
    }
  }, [fuelTypes, form.fuelType]);

  async function refresh() {
    setLogs(await api.fuelLogs.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelLog:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.gherId || !form.fuelType || !form.quantityKg) return;
    setLogError("");
    setLoading(true);
    try {
      await api.fuelLogs.create({
        gherId: form.gherId,
        fuelType: form.fuelType,
        quantityKg: Number(form.quantityKg),
      });
      setForm((f) => ({ ...f, quantityKg: "" }));
      setShowForm(false);
      await refresh();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)} disabled={fuelTypes.length === 0}>
          <Plus className="h-4 w-4" /> {t("firing.logFuelUsedToday")}
        </Button>
      </div>

      {fuelTypes.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-ink-muted">
            {t("firing.noFuelTypesYet")}
          </p>
        </Card>
      )}

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.gherId}
              onChange={(e) => setForm((f) => ({ ...f, gherId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("firing.chamberPlaceholder")}</option>
              {ghers.map((g) => (
                <option key={g._id} value={g._id}>
                  {t("firing.gherNumber", { number: g.number })}
                </option>
              ))}
            </select>
            <select
              value={form.fuelType}
              onChange={(e) => setForm((f) => ({ ...f, fuelType: e.target.value }))}
              className={inputClass}
            >
              {fuelTypes.map((ft) => (
                <option key={ft._id} value={ft.name}>
                  {ft.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("firing.quantityFedKg")}
              value={form.quantityKg}
              onChange={(e) => setForm((f) => ({ ...f, quantityKg: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("common.save")}
            </Button>
          </form>
        </Card>
      )}

      {logError && <p className="text-sm text-status-critical">{logError}</p>}
      <Card>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("firing.noFuelUsageLoggedYet")}</p>
        ) : (
          <div className="space-y-1">
            {pagedLogs.map((l) =>
              editingLogId === l._id ? (
                <form key={l._id} onSubmit={saveEditLog} className="grid grid-cols-2 gap-2 rounded-lg border border-series-1/30 bg-series-1/5 p-2">
                  <select
                    required
                    value={editForm.gherId}
                    onChange={(e) => setEditForm((f) => ({ ...f, gherId: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">{t("firing.chamberPlaceholder")}</option>
                    {ghers.map((g) => (
                      <option key={g._id} value={g._id}>
                        {t("firing.gherNumber", { number: g.number })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editForm.fuelType}
                    onChange={(e) => setEditForm((f) => ({ ...f, fuelType: e.target.value }))}
                    className={inputClass}
                  >
                    {fuelTypes.map((ft) => (
                      <option key={ft._id} value={ft.name}>
                        {ft.name}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    type="number"
                    placeholder={t("firing.quantityFedKg")}
                    value={editForm.quantityKg}
                    onChange={(e) => setEditForm((f) => ({ ...f, quantityKg: e.target.value }))}
                    className={cn(inputClass, "col-span-2")}
                  />
                  <div className="col-span-2 flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditingLogId(null)} className="flex-1">
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" disabled={savingEdit} className="flex-1">
                      {t("common.saveChanges")}
                    </Button>
                  </div>
                </form>
              ) : (
                <div key={l._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="text-ink-primary">
                      {t("firing.gherFuelLine", {
                        number: typeof l.gherId === "object" ? l.gherId.number : "—",
                        fuelType: l.fuelType,
                      })}
                    </p>
                    <p className="text-sm text-ink-muted">{new Date(l.date).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-ink-primary">
                      {l.quantityKg.toLocaleString("en-IN")} {t("firing.kg")}
                    </span>
                    <button type="button" onClick={() => startEditLog(l)} className="text-ink-muted hover:text-series-1" aria-label={t("common.edit")}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLog(l._id)}
                      disabled={deletingLogId === l._id}
                      className="text-ink-muted hover:text-status-critical disabled:opacity-50"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

// The 6-person firing team's rotation at a glance — who's on the day shift,
// who's on the night shift (3 days then 3 nights, computed from each
// fitter's rotation anchor), a target-headcount badge (flagged, not
// blocked, if the team drifts from 6 — same soft-warning convention used
// everywhere else in this app), and click-through to each fitter's profile.
function RosterSection({
  roster,
  onOpenFitter,
  onAddFitter,
}: {
  roster: FitterRosterSummary | null;
  onOpenFitter: (fitterId: string) => void;
  onAddFitter: () => void;
}) {
  const { t } = useTranslation();
  if (!roster) return null;
  const offTarget = roster.teamSize !== FIRING_TEAM_TARGET;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("firing.firingTeamRoster")}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={offTarget ? "warning" : "good"}>
            {t("firing.teamSizeLaborers", { count: roster.teamSize, target: FIRING_TEAM_TARGET })}
          </Badge>
          <Button size="sm" onClick={onAddFitter}>
            <Plus className="h-4 w-4" /> {t("firing.newFitter")}
          </Button>
        </div>
      </CardHeader>

      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            { key: "dayShift" as const, labelKey: "firing.dayShift" },
            { key: "nightShift" as const, labelKey: "firing.nightShift" },
          ] as const
        ).map(({ key, labelKey }) => (
          <div key={key}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t(labelKey)} ({roster[key].length})
            </p>
            {roster[key].length === 0 ? (
              <p className="text-sm text-ink-muted">{t("firing.noOneScheduled")}</p>
            ) : (
              <div className="space-y-1">
                {roster[key].map((r) => (
                  <button
                    key={r.fitter.id}
                    onClick={() => onOpenFitter(r.fitter.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-ink-primary/5 px-3 py-2 text-left text-sm hover:bg-ink-primary/10"
                  >
                    <span className="text-ink-primary">{r.fitter.name}</span>
                    <span
                      className={`text-xs tabular-nums ${r.balance > 0 ? "text-status-critical" : r.balance < 0 ? "text-status-warning" : "text-ink-muted"}`}
                    >
                      {r.fitter.monthlySalary
                        ? `₹${formatINR(r.fitter.monthlySalary)}${t("firing.perMonthSuffix")}`
                        : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {roster.unscheduled.length > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-sm text-ink-muted">
          {t("firing.notOnRotation", { names: roster.unscheduled.map((r) => r.fitter.name).join(", ") })}
        </p>
      )}
    </Card>
  );
}

function ShiftsTab() {
  const { t } = useTranslation();
  const [shifts, setShifts] = useState<FiringShift[]>([]);
  const [fitters, setFitters] = useState<Person[]>([]);
  const [roster, setRoster] = useState<FitterRosterSummary | null>(null);
  const [openFitterId, setOpenFitterId] = useState<string | null>(null);
  const [showAddFitter, setShowAddFitter] = useState(false);
  const ghers = useGhers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fitterId: "",
    gherId: "",
    shiftType: "DAY" as ShiftType,
    handoverNotes: "",
    overtimeHours: "",
    overtimeRate: "",
    bonusAmount: "",
  });
  const [loading, setLoading] = useState(false);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [shiftError, setShiftError] = useState("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [shiftData, fitterData, rosterData] = await Promise.all([
      api.firingShifts.list(),
      api.people.list("FITTER"),
      api.firingShifts.roster(),
    ]);
    setShifts(shiftData);
    setFitters(fitterData);
    setRoster(rosterData);
  }

  // Bug fix: Firing Shift entries had no delete path at all — no edit/
  // delete affordance anywhere, unlike every other production-entry
  // module (Molding/Stacking/Nikasi all support this).
  async function handleDeleteShift(id: string) {
    if (!confirm(t("firing.confirmDeleteShift"))) return;
    setShiftError("");
    setDeletingShiftId(id);
    try {
      await api.firingShifts.remove(id);
      await refresh();
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setDeletingShiftId(null);
    }
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("firingShift:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());

  function handleFitterChange(fitterId: string) {
    const scheduled = roster
      ? [...roster.dayShift, ...roster.nightShift].find((r) => r.fitter.id === fitterId)?.scheduledShiftType
      : null;
    setForm((f) => ({ ...f, fitterId, shiftType: scheduled ?? f.shiftType }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fitterId) return;
    setShiftError("");
    setLoading(true);
    try {
      await api.firingShifts.create({
        fitterId: form.fitterId,
        gherId: form.gherId || undefined,
        shiftType: form.shiftType,
        handoverNotes: form.handoverNotes || undefined,
        overtimeHours: form.overtimeHours ? Number(form.overtimeHours) : undefined,
        overtimeRate: form.overtimeRate ? Number(form.overtimeRate) : undefined,
        bonusAmount: form.bonusAmount ? Number(form.bonusAmount) : undefined,
      });
      setForm({ fitterId: "", gherId: "", shiftType: "DAY", handoverNotes: "", overtimeHours: "", overtimeRate: "", bonusAmount: "" });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  if (openFitterId) {
    return <FitterDetailPage fitterId={openFitterId} onBack={() => setOpenFitterId(null)} />;
  }

  return (
    <div className="space-y-3">
      <RosterSection roster={roster} onOpenFitter={setOpenFitterId} onAddFitter={() => setShowAddFitter(true)} />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("firing.logShiftHandover")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select required value={form.fitterId} onChange={(e) => handleFitterChange(e.target.value)} className={inputClass}>
              <option value="">{t("firing.fitterOstadPlaceholder")}</option>
              {fitters.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              value={form.shiftType}
              onChange={(e) => setForm((f) => ({ ...f, shiftType: e.target.value as ShiftType }))}
              className={inputClass}
            >
              <option value="DAY">{t("firing.dayShift")}</option>
              <option value="NIGHT">{t("firing.nightShift")}</option>
            </select>
            <select
              value={form.gherId}
              onChange={(e) => setForm((f) => ({ ...f, gherId: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("firing.chamberBeingTendedOptional")}</option>
              {ghers.map((g) => (
                <option key={g._id} value={g._id}>
                  {t("firing.gherNumber", { number: g.number })}
                </option>
              ))}
            </select>
            <input
              placeholder={t("firing.handoverNotesPlaceholder")}
              value={form.handoverNotes}
              onChange={(e) => setForm((f) => ({ ...f, handoverNotes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              type="number"
              placeholder={t("firing.otHoursPlaceholder")}
              value={form.overtimeHours}
              onChange={(e) => setForm((f) => ({ ...f, overtimeHours: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("firing.otRatePlaceholder")}
              value={form.overtimeRate}
              onChange={(e) => setForm((f) => ({ ...f, overtimeRate: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("firing.performanceBonusPlaceholder")}
              value={form.bonusAmount}
              onChange={(e) => setForm((f) => ({ ...f, bonusAmount: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("firing.saveShift")}
            </Button>
          </form>
        </Card>
      )}

      {shiftError && <p className="text-sm text-status-critical">{shiftError}</p>}
      <Card>
        {shifts.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("firing.noShiftsLoggedYet")}</p>
        ) : (
          <div className="space-y-1">
            {shifts.map((s) => {
              const fitterId = typeof s.fitterId === "object" ? s.fitterId._id : s.fitterId;
              return (
              <div key={s._id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-ink-primary">
                    {typeof s.fitterId === "object" ? (
                      <button onClick={() => setOpenFitterId(fitterId)} className="hover:underline">
                        {s.fitterId.name}
                      </button>
                    ) : (
                      "—"
                    )}{" "}
                    · <Badge variant="neutral">{s.shiftType}</Badge>
                    {typeof s.gherId === "object" && s.gherId ? ` · ${t("firing.gherNumber", { number: s.gherId.number })}` : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted">{new Date(s.date).toLocaleDateString("en-IN")}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(s._id)}
                      disabled={deletingShiftId === s._id}
                      aria-label={t("common.delete")}
                      className="text-ink-muted hover:text-status-critical disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {s.handoverNotes && <p className="mt-1 text-sm text-ink-muted">{s.handoverNotes}</p>}
                {(s.overtimeHours > 0 || s.bonusAmount > 0) && (
                  <p className="mt-1 text-xs text-status-good">
                    {s.overtimeHours > 0 ? t("firing.hoursOT", { hours: s.overtimeHours }) : ""}
                    {s.overtimeHours > 0 && s.bonusAmount > 0 ? " · " : ""}
                    {s.bonusAmount > 0 ? t("firing.bonusAmount", { amount: s.bonusAmount }) : ""}
                  </p>
                )}
              </div>
              );
            })}
          </div>
        )}
      </Card>

      {showAddFitter && (
        <AddPersonModal defaultType="FITTER" onClose={() => setShowAddFitter(false)} onCreated={refresh} />
      )}
    </div>
  );
}

function GradingTab() {
  const { t } = useTranslation();
  const [gradings, setGradings] = useState<ChamberGrading[]>([]);
  const [roundSpeed, setRoundSpeed] = useState<FireRoundSpeed | null>(null);
  const ghers = useGhers();
  const categories = useBrickCategories();
  const [showForm, setShowForm] = useState(false);
  const [gherId, setGherId] = useState("");
  const [items, setItems] = useState<LineItemRow[]>([emptyLineItemRow()]);
  const [loading, setLoading] = useState(false);
  const [gradingError, setGradingError] = useState("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { page, setPage, pageCount, pageItems: pagedGradings, total } = usePagination(gradings, 10);

  // Grading is the finalize-after-unloading step now — the chamber picker
  // suggests UNLOADING chambers first (falling back to every chamber if
  // none are mid-unload, e.g. grading something logged a little late).
  const unloadingGhers = ghers.filter((g) => g.status === "UNLOADING");

  async function refresh() {
    const [gradingData, speedData] = await Promise.all([api.chamberGradings.list(), api.gherRoundSpeed()]);
    setGradings(gradingData);
    setRoundSpeed(speedData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("grading:update", () => refresh());
  useKilnEvent("gher:update", () => refresh());

  const validItems = items.filter(isValidLineItemRow);

  // Bug fix (D2): no catch at all — this is exactly where chamberGrading.
  // service.ts's own D1 guard (rejecting a grading against a chamber that
  // isn't UNLOADING, with a real, actionable message) used to get silently
  // swallowed, since nothing here ever surfaced a rejection to the admin.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gherId || validItems.length === 0) return;
    setGradingError("");
    setLoading(true);
    try {
      await api.chamberGradings.create({
        gherId,
        items: validItems.map((row) => ({ categoryId: row.categoryId, bricksCount: Number(row.bricksCount) })),
      });
      setGherId("");
      setItems([emptyLineItemRow()]);
      setShowForm(false);
      await refresh();
    } catch (err) {
      setGradingError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {roundSpeed && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-muted">{t("firing.fireRoundSpeed", { days: roundSpeed.days })}</p>
              <p className="text-2xl font-semibold tabular-nums text-ink-primary">{t("firing.chambersPerDay", { count: roundSpeed.chambersPerDay })}</p>
            </div>
            {roundSpeed.currentFireGherNumber != null && (
              <div className="flex items-center gap-2 text-sm text-ink-secondary">
                <Flame className="h-4 w-4 text-series-2" />
                {t("firing.fireCurrentlyAtGher", { number: roundSpeed.currentFireGherNumber })}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("firing.logGrading")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <select required value={gherId} onChange={(e) => setGherId(e.target.value)} className={inputClass}>
              <option value="">{t("firing.chamberUnloadingPlaceholder")}</option>
              {(unloadingGhers.length > 0 ? unloadingGhers : ghers).map((g) => (
                <option key={g._id} value={g._id}>
                  {t("firing.gherNumberStatus", { number: g.number, status: g.status })}
                </option>
              ))}
            </select>
            <BrickLineItemsEditor items={items} onChange={setItems} categories={categories} pricingEnabled={false} />
            {gradingError && <p className="text-sm text-status-critical">{gradingError}</p>}
            <Button type="submit" disabled={loading || !gherId || validItems.length === 0}>
              {t("firing.saveGrading")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {gradings.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("firing.noGradingsLoggedYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("firing.chamberHeader")}</th>
                  <th className="pb-2 font-medium">{t("stock.brickCategoriesHeading")}</th>
                  <th className="pb-2 font-medium text-right">{t("firing.totalOutputHeader")}</th>
                  <th className="pb-2 font-medium text-right">{t("firing.recoveryHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedGradings.map((g) => {
                  const hasItems = g.items && g.items.length > 0;
                  return (
                    <tr key={g._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(g.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-primary">#{typeof g.gherId === "object" ? g.gherId.number : "—"}</td>
                      <td className="py-3 max-w-[280px]">
                        {hasItems ? (
                          <div className="flex flex-wrap gap-1">
                            {g.items.map((item, i) => (
                              <span key={i} className="rounded-full border border-border bg-ink-primary/5 px-2 py-0.5 text-xs text-ink-secondary">
                                {typeof item.categoryId === "object" ? item.categoryId.category : "—"}: {item.bricksCount.toLocaleString("en-IN")}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">{t("firing.legacyGradingLabel")}</span>
                        )}
                      </td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">{g.totalOutput.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-right">
                        {g.recoveryPercent != null ? (
                          // Bug fix: recoveryPercent = output/stacked is never bounded
                          // at 100% — a value over that is physically impossible (more
                          // bricks graded than were ever stacked this cycle) and always
                          // points to a data-entry error, so it must never read as
                          // "good" green like a genuinely high recovery rate would.
                          <Badge variant={g.recoveryPercent > 100 ? "critical" : g.recoveryPercent >= 85 ? "good" : g.recoveryPercent >= 70 ? "warning" : "critical"}>
                            {g.recoveryPercent}%
                          </Badge>
                        ) : (
                          "—"
                        )}
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
    </div>
  );
}

function IncidentsTab() {
  const { t } = useTranslation();
  const incidentLabels = useIncidentLabels(t);
  const [incidents, setIncidents] = useState<KilnIncident[]>([]);
  const ghers = useGhers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "CRACK_LEAKAGE" as IncidentType,
    gherId: "",
    description: "",
    repairCost: "",
    bricksLost: "",
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { page, setPage, pageCount, pageItems: pagedIncidents, total } = usePagination(incidents, 10);

  async function refresh() {
    setIncidents(await api.incidents.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("incident:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.description) return;
    setFormError("");
    setLoading(true);
    try {
      await api.incidents.create({
        type: form.type,
        gherId: form.gherId || undefined,
        description: form.description,
        repairCost: form.repairCost ? Number(form.repairCost) : undefined,
        bricksLost: form.bricksLost ? Number(form.bricksLost) : undefined,
      });
      setForm({ type: "CRACK_LEAKAGE", gherId: "", description: "", repairCost: "", bricksLost: "" });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("firing.logIncidentEmergency")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as IncidentType }))}
              className={inputClass}
            >
              {Object.entries(incidentLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={form.gherId}
              onChange={(e) => setForm((f) => ({ ...f, gherId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("firing.chamberOptionalPlaceholder")}</option>
              {ghers.map((g) => (
                <option key={g._id} value={g._id}>
                  {t("firing.gherNumber", { number: g.number })}
                </option>
              ))}
            </select>
            <input
              required
              placeholder={t("firing.whatHappenedPlaceholder")}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              type="number"
              placeholder={t("firing.repairEmergencyCostPlaceholder")}
              value={form.repairCost}
              onChange={(e) => setForm((f) => ({ ...f, repairCost: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("firing.bricksLostOptionalPlaceholder")}
              value={form.bricksLost}
              onChange={(e) => setForm((f) => ({ ...f, bricksLost: e.target.value }))}
              className={inputClass}
            />
            {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("firing.saveIncident")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {incidents.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("firing.noIncidentsLogged")}</p>
        ) : (
          <div className="space-y-1">
            {pagedIncidents.map((inc) => (
              <div key={inc._id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-ink-primary">
                    <Badge variant="critical">{incidentLabels[inc.type]}</Badge>{" "}
                    {typeof inc.gherId === "object" && inc.gherId ? t("firing.gherNumber", { number: inc.gherId.number }) : ""}
                  </p>
                  <span className="text-sm text-ink-muted">{new Date(inc.date).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="mt-1 text-xs text-ink-secondary">{inc.description}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {inc.repairCost > 0 ? t("firing.repairCostSuffix", { amount: formatINR(inc.repairCost) }) : ""}
                  {inc.repairCost > 0 && inc.bricksLost > 0 ? " · " : ""}
                  {inc.bricksLost > 0 ? t("firing.bricksLostSuffix", { count: inc.bricksLost.toLocaleString("en-IN") }) : ""}
                </p>
              </div>
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

// Thekedar-wise Pakayi summary — mirrors Nikasi.tsx's ContractorSummarySection:
// each contractor's mapped worker gang, combined output and ledger balance,
// click-through to their full profile.
function PakayiContractorSummarySection({
  summary,
  onOpenLedger,
  onOpenContractor,
  onAddThekedar,
}: {
  summary: PakayiContractorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenContractor: (contractorId: string) => void;
  onAddThekedar: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink-primary">{t("firing.thekedarWise")}</h4>
          <p className="text-sm text-ink-muted">{t("firing.thekedarWiseSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("firing.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalQuantityAllContractors.toLocaleString("en-IN")}</span>
            </p>
          )}
          <Button size="sm" onClick={onAddThekedar}>
            <Plus className="h-4 w-4" /> {t("firing.newThekedar")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.contractors.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("firing.noThekedarsYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.contractors.map((c) => (
            <Card key={c.contractor.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenContractor(c.contractor.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{c.contractor.name}</p>
                  <p className="text-sm text-ink-muted">
                    {t("firing.laborerCount", { count: c.workers.length })}
                    {c.contractor.monthlySalary ? ` · ₹${formatINR(c.contractor.monthlySalary)}${t("firing.perMonthSuffix")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(c.contractor.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("firing.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{c.totalQuantity.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("firing.quantityLabel")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(c.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("firing.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${c.balance > 0 ? "text-status-critical" : c.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(c.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{c.balance >= 0 ? t("firing.dueLabel") : t("firing.advanceLabel")}</p>
                </div>
              </div>

              {c.workers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {c.workers.map((w) => (
                    <span key={w.id} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      {w.name} · {w.quantity.toLocaleString("en-IN")}
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

// Operator-wise Pakayi summary — for independent workers not mapped under
// any thekedar.
function PakayiOperatorSummarySection({
  summary,
  onOpenLedger,
  onOpenOperator,
  onAddOperator,
}: {
  summary: PakayiOperatorSummary | null;
  onOpenLedger: (personId: string) => void;
  onOpenOperator: (operatorId: string) => void;
  onAddOperator: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink-primary">{t("firing.independentOperators")}</h4>
          <p className="text-sm text-ink-muted">{t("firing.independentOperatorsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("firing.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalQuantityAllOperators.toLocaleString("en-IN")}</span>
            </p>
          )}
          <Button size="sm" onClick={onAddOperator}>
            <Plus className="h-4 w-4" /> {t("firing.newLabor")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.operators.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("firing.noOperatorsYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.operators.map((o) => (
            <Card key={o.operator.id}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onOpenOperator(o.operator.id)}>
                  <p className="text-sm font-semibold text-ink-primary hover:underline">{o.operator.name}</p>
                  <p className="text-sm text-ink-muted">
                    {t("firing.entryCount", { count: o.entryCount })}
                    {o.operator.monthlySalary ? ` · ₹${formatINR(o.operator.monthlySalary)}${t("firing.perMonthSuffix")}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => onOpenLedger(o.operator.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("firing.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{o.totalQuantity.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("firing.quantityLabel")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(o.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("firing.paidLabel")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${o.balance > 0 ? "text-status-critical" : o.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(o.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{o.balance >= 0 ? t("firing.dueLabel") : t("firing.advanceLabel")}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PakayiTab() {
  const { t } = useTranslation();
  const [contractorSummary, setContractorSummary] = useState<PakayiContractorSummary | null>(null);
  const [operatorSummary, setOperatorSummary] = useState<PakayiOperatorSummary | null>(null);
  const [openContractorId, setOpenContractorId] = useState<string | null>(null);
  const [openOperatorId, setOpenOperatorId] = useState<string | null>(null);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [showAddThekedar, setShowAddThekedar] = useState(false);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [contractorData, operatorData] = await Promise.all([
      api.workEntries.pakayiContractorSummary(),
      api.workEntries.pakayiOperatorSummary(),
    ]);
    setContractorSummary(contractorData);
    setOperatorSummary(operatorData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("workEntry:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function openLedgerFor(personId: string) {
    const detail = await api.people.get(personId);
    setLedgerFor(detail.person);
  }

  if (openContractorId) {
    return <PakayiContractorDetailPage contractorId={openContractorId} onBack={() => setOpenContractorId(null)} />;
  }
  if (openOperatorId) {
    return <PakayiOperatorDetailPage operatorId={openOperatorId} onBack={() => setOpenOperatorId(null)} />;
  }

  return (
    <div className="space-y-6">
      <PakayiContractorSummarySection
        summary={contractorSummary}
        onOpenLedger={openLedgerFor}
        onOpenContractor={setOpenContractorId}
        onAddThekedar={() => setShowAddThekedar(true)}
      />
      <PakayiOperatorSummarySection
        summary={operatorSummary}
        onOpenLedger={openLedgerFor}
        onOpenOperator={setOpenOperatorId}
        onAddOperator={() => setShowAddOperator(true)}
      />

      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {showAddThekedar && (
        <AddPersonModal
          defaultType="LABOUR_CONTRACTOR"
          defaultWorkType="PAKAYI"
          onClose={() => setShowAddThekedar(false)}
          onCreated={refresh}
        />
      )}
      {showAddOperator && (
        <AddPersonModal defaultType="WORKER" defaultWorkType="PAKAYI" onClose={() => setShowAddOperator(false)} onCreated={refresh} />
      )}
    </div>
  );
}

export function Firing() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"shifts" | "grading" | "incidents" | "fuel" | "pakayi">("grading");
  const fuelTypes = useFuelTypes();

  return (
    <div className="space-y-4">
      <ChamberBoard />

      <FuelUsageSummary fuelTypes={fuelTypes} />

      <SegmentedTabs
        options={[
          { value: "grading" as const, label: t("firing.tabGrading") },
          { value: "shifts" as const, label: t("firing.tabShifts") },
          { value: "pakayi" as const, label: t("firing.tabPakayi") },
          { value: "incidents" as const, label: t("firing.tabIncidents") },
          { value: "fuel" as const, label: t("firing.tabFuel") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "grading" && <GradingTab />}
      {tab === "shifts" && <ShiftsTab />}
      {tab === "pakayi" && <PakayiTab />}
      {tab === "incidents" && <IncidentsTab />}
      {tab === "fuel" && <FuelUsageTab fuelTypes={fuelTypes} />}
    </div>
  );
}
