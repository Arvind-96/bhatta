import { MouseEvent, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChips, FilterDivider } from "@/components/ui/filter-chips";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { contractStatusLabel, rateBasisLabel } from "@/components/soil/ContractDetailPage";
import { AddSoilArrivalModal } from "@/components/soil/AddSoilArrivalModal";
import { EditSoilArrivalModal } from "@/components/soil/EditSoilArrivalModal";
import { EditSoilContractModal } from "@/components/soil/EditSoilContractModal";
import { LandownerDetailPage } from "@/components/people/LandownerDetailPage";
import type { Person, SoilArrival, SoilContract, SoilContractDashboard, SoilContractRateType, SoilContractStatus } from "@/types";

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
function ArrivalsTab({ onOpenLandowner }: { onOpenLandowner: (id: string) => void }) {
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
                {pagedArrivals.map((a) => {
                  const owner = typeof a.landownerId === "object" ? a.landownerId : null;
                  return (
                  <tr key={a._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-secondary">{new Date(a.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">
                      {owner ? (
                        <button onClick={() => onOpenLandowner(owner._id)} className="hover:underline">
                          {owner.name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
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
                  );
                })}
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

function ContractsTab({ onOpenLandowner }: { onOpenLandowner: (id: string) => void }) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<SoilContract[]>([]);
  const [dashboard, setDashboard] = useState<SoilContractDashboard | null>(null);
  const [editingContract, setEditingContract] = useState<SoilContract | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SoilContractStatus | "ALL">("ALL");
  const [rateTypeFilter, setRateTypeFilter] = useState<SoilContractRateType | "ALL">("ALL");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  // Contracts are only ever created via the People page's Add Landowner
  // flow now (its embedded, optional Contract Details section) — this tab
  // is a read-only listing of whatever contracts already exist there, so
  // this Contracts tab has no creation form of its own.
  async function refresh() {
    const [contractsData, dashboardData] = await Promise.all([api.soilContracts.list(), api.soilContracts.dashboard()]);
    setContracts(contractsData);
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
                {pagedContracts.map((c) => {
                  const owner = typeof c.landownerId === "object" ? c.landownerId : null;
                  return (
                  <tr
                    key={c._id}
                    onClick={() => owner && onOpenLandowner(owner._id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                  >
                    <td className="py-3 text-ink-primary">{c.contractNumber}</td>
                    <td className="py-3 text-ink-secondary">
                      {typeof c.landId === "object" ? c.landId.name : "—"} — {owner ? owner.name : "—"}
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
                  );
                })}
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
  const [openLandownerId, setOpenLandownerId] = useState<string | null>(null);

  // A landowner opened from either tab replaces the whole tab area with a
  // full page (LandownerDetailPage), not a popup — "Back" returns here
  // without losing which tab was active. Same LandownerDetailPage the
  // People page's Landowner tab opens, so the profile looks identical no
  // matter which page it was opened from -- contracts never open their own
  // separate page here, only the landowner they belong to.
  if (openLandownerId) {
    return <LandownerDetailPage landownerId={openLandownerId} onBack={() => setOpenLandownerId(null)} />;
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={(Object.keys(TAB_LABEL_KEYS) as (keyof typeof TAB_LABEL_KEYS)[]).map((tabKey) => ({ value: tabKey, label: t(TAB_LABEL_KEYS[tabKey]) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "arrivals" && <ArrivalsTab onOpenLandowner={setOpenLandownerId} />}
      {tab === "contracts" && <ContractsTab onOpenLandowner={setOpenLandownerId} />}
    </div>
  );
}
