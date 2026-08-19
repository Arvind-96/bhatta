import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChips, FilterDivider } from "@/components/ui/filter-chips";
import { DateInput } from "@/components/ui/date-input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { ContractDetailPage, contractStatusLabel, rateBasisLabel } from "@/components/soil/ContractDetailPage";
import { AddSoilArrivalModal } from "@/components/soil/AddSoilArrivalModal";
import { EditSoilArrivalModal } from "@/components/soil/EditSoilArrivalModal";
import { EditSoilContractModal } from "@/components/soil/EditSoilContractModal";
import type {
  DepthUnit,
  Land,
  Person,
  SoilArrival,
  SoilContract,
  SoilContractDashboard,
  SoilContractRateType,
  SoilContractStatus,
} from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function driverName(p: SoilArrival["jcbDriverId"]) {
  if (!p) return "";
  return typeof p === "string" ? p : p.name;
}

// The Soil page's day-to-day workflow — logging today's soil arrivals
// against a field owner (Khet ka malik), independent of the Land/Contract
// apparatus below. Deliberately simple: no rate, just who/how/how much
// arrived and what's been paid, mirroring AddWorkEntryModal's role for
// labour. The same modal is reused from the field owner's own profile
// (LandownerDetailPage), so the two entry points stay identical.
function ArrivalsTab() {
  const { t } = useTranslation();
  const [arrivals, setArrivals] = useState<SoilArrival[]>([]);
  const [landowners, setLandowners] = useState<Person[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingArrival, setEditingArrival] = useState<SoilArrival | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [arrivalsData, landownersData, driversData] = await Promise.all([
      api.soilArrivals.list(),
      api.people.list("LANDOWNER"),
      api.people.list("DRIVER"),
    ]);
    setArrivals(arrivalsData);
    setLandowners(landownersData);
    setDrivers(driversData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("soilArrival:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedArrivals, total } = usePagination(arrivals, 10);

  const totalTrolleys = arrivals.reduce((sum, a) => sum + a.trolleyCount, 0);
  const totalGiven = arrivals.reduce((sum, a) => sum + (a.paymentGiven ?? 0), 0);
  const totalPending = arrivals.reduce((sum, a) => sum + (a.paymentPending ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalTrolleys.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("soil.trolleysArrivedAllTime")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalGiven)}</p>
          <p className="text-sm text-ink-muted">{t("soil.paymentGivenLabel")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-status-warning">₹{formatINR(totalPending)}</p>
          <p className="text-sm text-ink-muted">{t("soil.paymentPendingLabel")}</p>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("soil.logSoilArrival")}
        </Button>
      </div>

      <Card>
        {arrivals.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("soil.noArrivalsLoggedYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("soil.fieldOwner")}</th>
                  <th className="pb-2 font-medium">{t("people.jcb")}</th>
                  <th className="pb-2 font-medium">{t("soil.tractorHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.trolleysHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.givenHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.pendingHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.remainingHeader")}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedArrivals.map((a) => (
                  <tr key={a._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-secondary">{new Date(a.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">{typeof a.landownerId === "object" ? a.landownerId.name : "—"}</td>
                    <td className="py-3 text-ink-secondary">{a.jcbUsed ? driverName(a.jcbDriverId) || t("common.yes") : "—"}</td>
                    <td className="py-3 text-ink-secondary">{a.tractorUsed ? driverName(a.tractorDriverId) || t("common.yes") : "—"}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{a.trolleyCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 tabular-nums text-status-good">₹{formatINR((a.paymentGiven ?? 0))}</td>
                    <td className="py-3 tabular-nums text-status-warning">₹{formatINR((a.paymentPending ?? 0))}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">
                      {a.soilRemaining != null ? a.soilRemaining.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={() => setEditingArrival(a)} className="text-xs font-medium text-series-1 hover:underline">
                        {t("common.edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {showAdd && (
        <AddSoilArrivalModal landowners={landowners} drivers={drivers} onClose={() => setShowAdd(false)} onCreated={refresh} />
      )}
      {editingArrival && (
        <EditSoilArrivalModal entry={editingArrival} drivers={drivers} onClose={() => setEditingArrival(null)} onSaved={refresh} />
      )}
    </div>
  );
}

const CONTRACT_STATUS_VARIANT = {
  DRAFT: "neutral",
  ACTIVE: "good",
  PAUSED: "warning",
  COMPLETED: "neutral",
  CANCELLED: "critical",
} as const;

const CONTRACT_STATUS_FILTERS: (SoilContractStatus | "ALL")[] = ["ALL", "ACTIVE", "DRAFT", "PAUSED", "COMPLETED", "CANCELLED"];
const CONTRACT_RATE_TYPE_FILTERS: { value: SoilContractRateType | "ALL"; labelKey: string }[] = [
  { value: "ALL", labelKey: "soil.allRates" },
  { value: "PER_TROLLEY", labelKey: "soil.perTrolley" },
  { value: "PER_BIGHA", labelKey: "soil.perBigha" },
  { value: "PER_DEPTH", labelKey: "soil.perDepth" },
];

function ContractsTab({ onOpenContract }: { onOpenContract: (contractId: string) => void }) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<SoilContract[]>([]);
  const [lands, setLands] = useState<Land[]>([]);
  const [landowners, setLandowners] = useState<Person[]>([]);
  const [dashboard, setDashboard] = useState<SoilContractDashboard | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<SoilContract | null>(null);
  const [showQuickAddLand, setShowQuickAddLand] = useState(false);
  const [quickLand, setQuickLand] = useState({ landownerId: "", name: "", khasraNumber: "", area: "", areaUnit: "bigha" });
  const [quickLandLoading, setQuickLandLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SoilContractStatus | "ALL">("ALL");
  const [rateTypeFilter, setRateTypeFilter] = useState<SoilContractRateType | "ALL">("ALL");
  const [form, setForm] = useState({
    landownerId: "",
    landId: "",
    rateType: "PER_TROLLEY" as SoilContractRateType,
    contractedQuantity: "",
    ratePerTrolley: "",
    contractedAreaBigha: "",
    ratePerBigha: "",
    contractedDepth: "",
    depthUnit: "feet" as DepthUnit,
    ratePerDepthUnit: "",
    advanceAmount: "",
    startDate: "",
    endDate: "",
    paymentTerms: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  const emptyContractForm = {
    landownerId: "",
    landId: "",
    rateType: "PER_TROLLEY" as SoilContractRateType,
    contractedQuantity: "",
    ratePerTrolley: "",
    contractedAreaBigha: "",
    ratePerBigha: "",
    contractedDepth: "",
    depthUnit: "feet" as DepthUnit,
    ratePerDepthUnit: "",
    advanceAmount: "",
    startDate: "",
    endDate: "",
    paymentTerms: "",
    notes: "",
  };

  // Selecting a landowner is the only thing the admin should have to do —
  // their existing land (khasra/area) and agreed dig-depth already live on
  // the Landowner profile (AddLandownerModal/LandownerDetailPage), so pull
  // those straight into the form. Every value landed here stays a plain
  // editable input afterwards, exactly like a manually typed one.
  function applyLandowner(landownerId: string) {
    const landowner = landowners.find((l) => l._id === landownerId);
    const ownerLands = lands.filter((l) => (typeof l.landownerId === "object" ? l.landownerId._id : l.landownerId) === landownerId);
    const primaryLand = ownerLands[0];
    setForm((f) => ({
      ...f,
      landownerId,
      landId: primaryLand?._id ?? "",
      contractedAreaBigha:
        primaryLand?.area != null ? String(primaryLand.area) : landowner?.khetArea != null ? String(landowner.khetArea) : f.contractedAreaBigha,
      contractedDepth: landowner?.agreedDepthFeet != null ? String(landowner.agreedDepthFeet) : f.contractedDepth,
      depthUnit: (landowner?.agreedDepthUnit as DepthUnit) ?? f.depthUnit,
    }));
  }

  async function refresh() {
    const [contractsData, landsData, landownersData, dashboardData] = await Promise.all([
      api.soilContracts.list(),
      api.lands.list(),
      api.people.list("LANDOWNER"),
      api.soilContracts.dashboard(),
    ]);
    setContracts(contractsData);
    setLands(landsData);
    setLandowners(landownersData);
    setDashboard(dashboardData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("soilContract:update", () => refresh());
  useKilnEvent("soilTrip:update", () => refresh());
  useKilnEvent("land:update", () => refresh());
  useKilnEvent("soilArrival:update", () => refresh());

  async function saveQuickLand(e: FormEvent) {
    e.preventDefault();
    if (!quickLand.landownerId || !quickLand.name) return;
    setQuickLandLoading(true);
    try {
      const land = await api.lands.create({
        landownerId: quickLand.landownerId,
        name: quickLand.name,
        khasraNumber: quickLand.khasraNumber || undefined,
        area: quickLand.area ? Number(quickLand.area) : undefined,
        areaUnit: quickLand.areaUnit || undefined,
      });
      await refresh();
      setForm((f) => ({ ...f, landownerId: quickLand.landownerId, landId: land._id }));
      setQuickLand({ landownerId: "", name: "", khasraNumber: "", area: "", areaUnit: "bigha" });
      setShowQuickAddLand(false);
    } finally {
      setQuickLandLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const land = lands.find((l) => l._id === form.landId);
    if (!land) return;
    if (form.rateType === "PER_TROLLEY" && (!form.contractedQuantity || !form.ratePerTrolley)) return;
    if (form.rateType === "PER_BIGHA" && (!form.contractedAreaBigha || !form.ratePerBigha)) return;
    if (form.rateType === "PER_DEPTH" && (!form.contractedDepth || !form.ratePerDepthUnit)) return;
    setLoading(true);
    try {
      await api.soilContracts.create({
        landId: form.landId,
        landownerId: typeof land.landownerId === "object" ? land.landownerId._id : land.landownerId,
        rateType: form.rateType,
        contractedQuantity: form.contractedQuantity ? Number(form.contractedQuantity) : undefined,
        ratePerTrolley: form.rateType === "PER_TROLLEY" ? Number(form.ratePerTrolley) : undefined,
        contractedAreaBigha: form.rateType === "PER_BIGHA" ? Number(form.contractedAreaBigha) : undefined,
        ratePerBigha: form.rateType === "PER_BIGHA" ? Number(form.ratePerBigha) : undefined,
        contractedDepth:
          (form.rateType === "PER_DEPTH" || form.rateType === "PER_BIGHA") && form.contractedDepth
            ? Number(form.contractedDepth)
            : undefined,
        depthUnit:
          (form.rateType === "PER_DEPTH" || form.rateType === "PER_BIGHA") && form.contractedDepth ? form.depthUnit : undefined,
        ratePerDepthUnit: form.rateType === "PER_DEPTH" ? Number(form.ratePerDepthUnit) : undefined,
        advanceAmount: form.advanceAmount ? Number(form.advanceAmount) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        paymentTerms: form.paymentTerms || undefined,
        notes: form.notes || undefined,
      });
      setForm(emptyContractForm);
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function settle(contract: SoilContract, e: MouseEvent) {
    e.stopPropagation();
    if (
      contract.remainingQuantity != null &&
      contract.remainingQuantity > 0 &&
      !confirm(t("soil.confirmSettleWithRemaining", { count: contract.remainingQuantity }))
    ) {
      return;
    }
    await api.soilContracts.settle(contract._id);
    refresh();
  }

  async function remove(contract: SoilContract, e: MouseEvent) {
    e.stopPropagation();
    const warning =
      contract.excavatedQuantity > 0 || contract.ledgerBalance !== 0
        ? t("soil.confirmDeleteContractWithData", {
            excavated: contract.excavatedQuantity.toLocaleString("en-IN"),
            balance: formatINR(contract.ledgerBalance),
          })
        : t("soil.confirmDeleteContract", { contractNumber: contract.contractNumber });
    if (!confirm(warning)) return;
    await api.soilContracts.remove(contract._id);
    refresh();
  }

  const filteredContracts = contracts.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (rateTypeFilter !== "ALL" && c.rateType !== rateTypeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const land = typeof c.landId === "object" ? c.landId : null;
    const owner = typeof c.landownerId === "object" ? c.landownerId : null;
    return (
      c.contractNumber.toLowerCase().includes(q) ||
      (land?.name ?? "").toLowerCase().includes(q) ||
      (land?.khasraNumber ?? "").toLowerCase().includes(q) ||
      (land?.village ?? "").toLowerCase().includes(q) ||
      (owner?.name ?? "").toLowerCase().includes(q) ||
      (owner?.phone ?? "").includes(q)
    );
  });
  const { page, setPage, pageCount, pageItems: pagedContracts, total } = usePagination(filteredContracts, 10);

  return (
    <div className="space-y-3">
      {dashboard && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card className="p-3">
            <p className="text-sm text-ink-muted">{t("soil.totalContracts")}</p>
            <p className="text-xl font-semibold tabular-nums text-ink-primary">{dashboard.totalContracts}</p>
            <p className="text-sm text-ink-muted">
              {t("soil.activeCompletedExpired", {
                active: dashboard.statusCounts.ACTIVE,
                completed: dashboard.statusCounts.COMPLETED,
                expired: dashboard.expiredCount,
              })}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-sm text-ink-muted">{t("soil.contractedQuantity")}</p>
            <p className="text-xl font-semibold tabular-nums text-ink-primary">{dashboard.totalContractedQuantity.toLocaleString("en-IN")}</p>
            <p className="text-sm text-ink-muted">{t("soil.trolleysUnit")}</p>
          </Card>
          <Card className="p-3">
            <p className="text-sm text-ink-muted">{t("soil.uthayiGayi")}</p>
            <p className="text-xl font-semibold tabular-nums text-ink-primary">{dashboard.totalExcavatedQuantity.toLocaleString("en-IN")}</p>
            <p className="text-sm text-ink-muted">
              {t("soil.remainingCount", { count: dashboard.totalRemainingQuantity.toLocaleString("en-IN") })}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-sm text-ink-muted">{t("soil.totalContractValue")}</p>
            <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(dashboard.totalContractValue)}</p>
            <p className="text-sm text-ink-muted">
              {dashboard.landAreaByUnit.map((l) => `${l.total} ${l.unit}`).join(", ") || "—"}
            </p>
          </Card>
        </div>
      )}

      {dashboard && (dashboard.alerts.nearingCompletion.length > 0 || dashboard.alerts.depthExceeded.length > 0) && (
        <div className="space-y-1.5">
          {dashboard.alerts.nearingCompletion.map((a) => (
            <p key={a.contractId} className="rounded-lg bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
              {t("soil.contractNearingCompletion", { contractNumber: a.contractNumber, percent: a.percentUsed })}
            </p>
          ))}
          {dashboard.alerts.depthExceeded.map((a) => (
            <p key={a.contractId} className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
              {t("soil.contractExceededDepth", {
                contractNumber: a.contractNumber,
                depthUsed: a.depthUsedFeet,
                depthAllowed: a.agreedDepthFeet,
              })}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            placeholder={t("soil.searchContractsPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(inputClass, "w-72 pl-9")}
          />
        </div>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("soil.newContract")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-primary/10 bg-surface/60 px-3 py-2.5 shadow-sm">
        <FilterChips
          label={t("common.status")}
          options={CONTRACT_STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? t("common.all") : contractStatusLabel(s, t) }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterDivider />
        <FilterChips
          label={t("common.rate")}
          options={CONTRACT_RATE_TYPE_FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
          value={rateTypeFilter}
          onChange={setRateTypeFilter}
        />
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.landownerId}
              onChange={(e) => applyLandowner(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("soil.selectFieldOwner")}</option>
              {landowners.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>

            <div className="col-span-2 flex gap-2">
              <select
                required
                value={form.landId}
                onChange={(e) => setForm((f) => ({ ...f, landId: e.target.value }))}
                className={cn(inputClass, "flex-1")}
              >
                <option value="">{t("soil.selectLand")}</option>
                {lands
                  .filter(
                    (l) => !form.landownerId || (typeof l.landownerId === "object" ? l.landownerId._id : l.landownerId) === form.landownerId
                  )
                  .map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.name} — {typeof l.landownerId === "object" ? l.landownerId.name : ""}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => setShowQuickAddLand((s) => !s)}
                className="whitespace-nowrap rounded-xl border border-border bg-ink-primary/5 px-3 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
              >
                {t("soil.newLand")}
              </button>
            </div>

            {showQuickAddLand && (
              <div className="col-span-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-ink-primary/5 p-3">
                <select
                  value={quickLand.landownerId}
                  onChange={(e) => setQuickLand((f) => ({ ...f, landownerId: e.target.value }))}
                  className={cn(inputClass, "col-span-2")}
                >
                  <option value="">{t("soil.selectFieldOwner")}</option>
                  {landowners.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder={t("soil.landNameNickname")}
                  value={quickLand.name}
                  onChange={(e) => setQuickLand((f) => ({ ...f, name: e.target.value }))}
                  className={cn(inputClass, "col-span-2")}
                />
                <input
                  placeholder={t("soil.khasraNumberOptional")}
                  value={quickLand.khasraNumber}
                  onChange={(e) => setQuickLand((f) => ({ ...f, khasraNumber: e.target.value }))}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder={t("soil.areaPlaceholder")}
                    value={quickLand.area}
                    onChange={(e) => setQuickLand((f) => ({ ...f, area: e.target.value }))}
                    className={inputClass}
                  />
                  <select
                    value={quickLand.areaUnit}
                    onChange={(e) => setQuickLand((f) => ({ ...f, areaUnit: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="bigha">{t("soil.bigha")}</option>
                    <option value="acre">{t("soil.acre")}</option>
                    <option value="hectare">{t("soil.hectare")}</option>
                  </select>
                </div>
                <Button type="button" size="sm" disabled={quickLandLoading} onClick={saveQuickLand} className="col-span-2">
                  {t("soil.saveLand")}
                </Button>
              </div>
            )}

            <div className="col-span-2 flex gap-1">
              {(
                [
                  { value: "PER_TROLLEY", label: t("soil.perTrolley") },
                  { value: "PER_BIGHA", label: t("soil.fixedPerBigha") },
                  { value: "PER_DEPTH", label: t("soil.fixedPerDepth") },
                ] as { value: SoilContractRateType; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rateType: opt.value }))}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    form.rateType === opt.value
                      ? "border-series-1 bg-series-1/10 text-series-1"
                      : "border-ink-primary/20 bg-surface text-ink-secondary hover:bg-ink-primary/10"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.rateType === "PER_TROLLEY" && (
              <>
                <input
                  required
                  type="number"
                  placeholder={t("soil.contractedQuantityTrolleysCap")}
                  value={form.contractedQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, contractedQuantity: e.target.value }))}
                  className={inputClass}
                />
                <input
                  required
                  type="number"
                  placeholder={t("soil.ratePerTrolleyRupees")}
                  value={form.ratePerTrolley}
                  onChange={(e) => setForm((f) => ({ ...f, ratePerTrolley: e.target.value }))}
                  className={inputClass}
                />
              </>
            )}

            {form.rateType === "PER_BIGHA" && (
              <>
                <input
                  required
                  type="number"
                  placeholder={t("soil.areaBigha")}
                  value={form.contractedAreaBigha}
                  onChange={(e) => setForm((f) => ({ ...f, contractedAreaBigha: e.target.value }))}
                  className={inputClass}
                />
                <input
                  required
                  type="number"
                  placeholder={t("soil.ratePerBighaRupees")}
                  value={form.ratePerBigha}
                  onChange={(e) => setForm((f) => ({ ...f, ratePerBigha: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder={t("soil.trolleyCapOptional")}
                  value={form.contractedQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, contractedQuantity: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder={t("soil.depthCapOptional")}
                  value={form.contractedDepth}
                  onChange={(e) => setForm((f) => ({ ...f, contractedDepth: e.target.value }))}
                  className={inputClass}
                />
              </>
            )}

            {form.rateType === "PER_DEPTH" && (
              <>
                <input
                  required
                  type="number"
                  placeholder={t("soil.depthFeetPlaceholder")}
                  value={form.contractedDepth}
                  onChange={(e) => setForm((f) => ({ ...f, contractedDepth: e.target.value }))}
                  className={inputClass}
                />
                <input
                  required
                  type="number"
                  placeholder={t("soil.ratePerFeetRupees")}
                  value={form.ratePerDepthUnit}
                  onChange={(e) => setForm((f) => ({ ...f, ratePerDepthUnit: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder={t("soil.trolleyCapOptional")}
                  value={form.contractedQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, contractedQuantity: e.target.value }))}
                  className={inputClass}
                />
              </>
            )}
            <input
              type="number"
              placeholder={t("soil.advanceAmountOptional")}
              value={form.advanceAmount}
              onChange={(e) => setForm((f) => ({ ...f, advanceAmount: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <DateInput
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className={inputClass}
            />
            <DateInput
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("soil.paymentTermsExample")}
              value={form.paymentTerms}
              onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              placeholder={t("common.notes")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("soil.saveContract")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {filteredContracts.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            {contracts.length === 0 ? t("soil.noContractsYet") : t("soil.noContractsMatchSearch")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("soil.contractHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.landOwnerHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.rateBasisHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.excavatedHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.valueHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.status")}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pagedContracts.map((c) => (
                  <tr
                    key={c._id}
                    onClick={() => onOpenContract(c._id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                  >
                    <td className="py-3 text-ink-primary">{c.contractNumber}</td>
                    <td className="py-3 text-ink-secondary">
                      {typeof c.landId === "object" ? c.landId.name : "—"} —{" "}
                      {typeof c.landownerId === "object" ? c.landownerId.name : "—"}
                    </td>
                    <td className="py-3 text-ink-secondary">{rateBasisLabel(c, t)}</td>
                    <td className="py-3 tabular-nums">
                      {c.remainingQuantity != null && c.percentUsed != null ? (
                        <Badge variant={c.overrun ? "critical" : c.percentUsed >= 90 ? "warning" : "neutral"}>
                          {c.remainingQuantity.toLocaleString("en-IN")} left ({c.percentUsed}%)
                        </Badge>
                      ) : (
                        <span className="text-ink-secondary">{t("soil.trolleysCountLabel", { count: c.excavatedQuantity.toLocaleString("en-IN") })}</span>
                      )}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(c.totalContractValue)}</td>
                    <td className="py-3">
                      <Badge variant={CONTRACT_STATUS_VARIANT[c.status]}>{contractStatusLabel(c.status, t)}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {c.status === "ACTIVE" && (
                          <button onClick={(e) => settle(c, e)} className="text-xs text-series-1 hover:underline">
                            {t("soil.settle")}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingContract(c);
                          }}
                          className="text-xs font-medium text-series-1 hover:underline"
                        >
                          {t("common.edit")}
                        </button>
                        <button onClick={(e) => remove(c, e)} className="text-xs font-medium text-status-critical hover:underline">
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {editingContract && (
        <EditSoilContractModal contract={editingContract} onClose={() => setEditingContract(null)} onSaved={refresh} />
      )}
    </div>
  );
}

const TAB_LABEL_KEYS = {
  arrivals: "soil.tabArrivals",
  contracts: "soil.tabContracts",
} as const;

export function Soil() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<keyof typeof TAB_LABEL_KEYS>("arrivals");
  const [openContractId, setOpenContractId] = useState<string | null>(null);

  // A contract opened from the Contracts tab replaces the whole tab area
  // with a full page (ContractDetailPage), not a popup — "Back to
  // contracts" returns here without losing which tab was active.
  if (openContractId) {
    return <ContractDetailPage contractId={openContractId} onBack={() => setOpenContractId(null)} />;
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={(Object.keys(TAB_LABEL_KEYS) as (keyof typeof TAB_LABEL_KEYS)[]).map((tabKey) => ({ value: tabKey, label: t(TAB_LABEL_KEYS[tabKey]) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "arrivals" && <ArrivalsTab />}
      {tab === "contracts" && <ContractsTab onOpenContract={setOpenContractId} />}
    </div>
  );
}
