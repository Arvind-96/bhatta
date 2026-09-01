import { useEffect, useState } from "react";
import { Plus, Printer, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { AddSandDeliveryModal } from "@/components/sand/AddSandDeliveryModal";
import { EditSandDeliveryModal } from "@/components/sand/EditSandDeliveryModal";
import { EditSandContractModal } from "@/components/sand/EditSandContractModal";
import { SandContractorDetailPage } from "@/components/people/SandContractorDetailPage";
import { printSandContract } from "@/lib/printDocument";
import type { Person, SandContract, SandContractRateType, SandDelivery } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function tractorSummary(entry: SandDelivery, t: (key: string) => string) {
  if (!entry.tractorUsed) return "—";
  const names = (entry.tractors ?? []).map((tr) => tr.driverName || tr.tractorNumber).filter(Boolean);
  return names.length > 0 ? names.join(", ") : t("common.yes");
}

// The Sand page's day-to-day workflow — logging today's sand deliveries
// against a sand contractor, independent of the Contract apparatus below.
// Same shape as Soil.tsx's ArrivalsTab (arrivals ↔ deliveries, field owner
// ↔ sand contractor), minus JCB and depth tracking which don't apply here.
function SandArrivalsTab({ onOpenContractor }: { onOpenContractor: (id: string) => void }) {
  const { t } = useTranslation();
  const [deliveries, setDeliveries] = useState<SandDelivery[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<SandDelivery | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [deliveriesData, contractorsData] = await Promise.all([
      api.sandDeliveries.list(),
      api.people.list("SAND_CONTRACTOR"),
    ]);
    setDeliveries(deliveriesData);
    setContractors(contractorsData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("sandDelivery:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedDeliveries, total } = usePagination(deliveries, 10);

  const totalTrolleys = deliveries.reduce((sum, d) => sum + d.trolleyCount, 0);
  const totalGiven = deliveries.reduce((sum, d) => sum + (d.paymentGiven ?? 0), 0);
  const totalPending = deliveries.reduce((sum, d) => sum + (d.paymentPending ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalTrolleys.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("sand.trolleysDeliveredAllTime")}</p>
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
          <Plus className="h-4 w-4" /> {t("sand.logSandDelivery")}
        </Button>
      </div>

      <Card>
        {deliveries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("sand.noDeliveriesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("people.sandContractor")}</th>
                  <th className="pb-2 font-medium">{t("soil.tractorHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.trolleysHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.givenHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.pendingHeader")}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedDeliveries.map((d) => {
                  const contractor = typeof d.sandContractorId === "object" ? d.sandContractorId : null;
                  return (
                  <tr key={d._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-secondary">{new Date(d.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">
                      {contractor ? (
                        <button onClick={() => onOpenContractor(contractor._id)} className="hover:underline">
                          {contractor.name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-ink-secondary">{tractorSummary(d, t)}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{d.trolleyCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 tabular-nums text-status-good">₹{formatINR(d.paymentGiven ?? 0)}</td>
                    <td className="py-3 pr-2 tabular-nums text-status-warning">₹{formatINR(d.paymentPending ?? 0)}</td>
                    <td className="py-3 pl-3 text-right">
                      <button onClick={() => setEditingDelivery(d)} className="text-xs font-medium text-series-1 hover:underline">
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

      {showAdd && <AddSandDeliveryModal sandContractors={contractors} onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {editingDelivery && <EditSandDeliveryModal entry={editingDelivery} onClose={() => setEditingDelivery(null)} onSaved={refresh} />}
    </div>
  );
}

const CONTRACT_RATE_TYPE_FILTERS: { value: SandContractRateType | "ALL"; labelKey: string }[] = [
  { value: "ALL", labelKey: "soil.allRates" },
  { value: "PER_TROLLEY", labelKey: "sand.perTrolley" },
  { value: "PER_THOUSAND_BRICKS", labelKey: "sand.perThousandBricks" },
];

function SandContractsTab({ onOpenContractor }: { onOpenContractor: (id: string) => void }) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<SandContract[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [editingContract, setEditingContract] = useState<SandContract | null>(null);
  const [search, setSearch] = useState("");
  const [rateTypeFilter, setRateTypeFilter] = useState<SandContractRateType | "ALL">("ALL");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  // Contracts are only ever created via the People page's Add Sand
  // Contractor flow, or later from a contractor's own profile ("New
  // Contract") — this tab is a read-only listing of whatever contracts
  // already exist, so it has no creation form of its own. It also fetches
  // every sand contractor (not just ones with a contract) so one added on
  // the People page without filling in the optional contract fields still
  // shows up here — as a "no contract yet" card, one click from their
  // profile's own New Contract button — instead of silently disappearing.
  async function refresh() {
    const [contractsData, contractorsData] = await Promise.all([api.sandContracts.list(), api.people.list("SAND_CONTRACTOR")]);
    setContracts(contractsData);
    setContractors(contractorsData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("sandContract:update", () => refresh());
  useKilnEvent("sandDelivery:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function remove(contract: SandContract) {
    if (!confirm(t("sand.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    await api.sandContracts.remove(contract._id);
    refresh();
  }

  async function printContract(contract: SandContract) {
    const contractorId = typeof contract.sandContractorId === "object" ? contract.sandContractorId._id : contract.sandContractorId;
    const contractorName = typeof contract.sandContractorId === "object" ? contract.sandContractorId.name : "—";
    const ledger = await api.people.listLedger(contractorId);
    const activeKiln = useAuthStore.getState().kilns.find((k) => k.kilnId === useAuthStore.getState().activeKilnId);
    printSandContract(
      contract,
      contractorName,
      { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone },
      ledger.filter((e) => e.contractId === contract._id)
    );
  }

  const contractorIdsWithContract = new Set(
    contracts.map((c) => (typeof c.sandContractorId === "object" ? c.sandContractorId._id : c.sandContractorId))
  );
  const contractorsWithoutContract = contractors.filter((c) => !contractorIdsWithContract.has(c._id));

  const filteredContracts = contracts.filter((c) => {
    if (rateTypeFilter !== "ALL" && c.rateType !== rateTypeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const owner = typeof c.sandContractorId === "object" ? c.sandContractorId : null;
    return c.contractNumber.toLowerCase().includes(q) || (owner?.name ?? "").toLowerCase().includes(q) || (owner?.phone ?? "").includes(q);
  });
  const { page, setPage, pageCount, pageItems: pagedContracts, total } = usePagination(filteredContracts, 10);

  const totalContractValue = contracts.reduce((sum, c) => sum + c.totalContractValue, 0);
  const totalContractedTrolleys = contracts.reduce((sum, c) => sum + (c.contractedTrolleys ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.totalContracts")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{contracts.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.contractedQuantity")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalContractedTrolleys.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("soil.trolleysUnit")}</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.totalContractValue")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalContractValue)}</p>
        </Card>
      </div>

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

      {contractorsWithoutContract.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("sand.contractorsNoContractYet")}</p>
          <div className="flex flex-wrap gap-2">
            {contractorsWithoutContract.map((c) => (
              <button
                key={c._id}
                onClick={() => onOpenContractor(c._id)}
                className="flex items-center gap-2 rounded-full border border-border bg-ink-primary/5 px-3 py-1.5 text-sm text-ink-secondary hover:border-series-1/40 hover:bg-series-1/5 hover:text-ink-primary"
              >
                {c.name}
                <Badge variant="neutral">{t("soil.noContractYet")}</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-primary/10 bg-surface/60 px-3 py-2.5 shadow-sm">
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
                  <th className="pb-2 font-medium">{t("people.sandContractor")}</th>
                  <th className="pb-2 font-medium">{t("common.rate")}</th>
                  <th className="pb-2 font-medium">{t("soil.valueHeader")}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pagedContracts.map((c) => {
                  const contractor = typeof c.sandContractorId === "object" ? c.sandContractorId : null;
                  return (
                  <tr
                    key={c._id}
                    onClick={() => contractor && onOpenContractor(contractor._id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                  >
                    <td className="py-3 text-ink-primary">{c.contractNumber}</td>
                    <td className="py-3 text-ink-secondary">{contractor ? contractor.name : "—"}</td>
                    <td className="py-3 text-ink-secondary">
                      {c.rateType === "PER_THOUSAND_BRICKS" ? t("sand.perThousandBricks") : t("sand.perTrolley")}
                      {c.contractedTrolleys != null ? ` · ${c.contractedTrolleys.toLocaleString("en-IN")}` : ""}
                      {c.contractPrice != null ? ` · ₹${formatINR(c.contractPrice)}` : ""}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(c.totalContractValue)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            printContract(c);
                          }}
                          className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                        >
                          <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingContract(c);
                          }}
                          className="text-xs font-medium text-series-1 hover:underline"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(c);
                          }}
                          className="text-xs font-medium text-status-critical hover:underline"
                        >
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
        <EditSandContractModal contract={editingContract} onClose={() => setEditingContract(null)} onSaved={refresh} />
      )}
    </div>
  );
}

const TAB_LABEL_KEYS = {
  arrivals: "sand.tabDeliveries",
  contracts: "soil.tabContracts",
} as const;

export function Sand() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<keyof typeof TAB_LABEL_KEYS>("arrivals");
  const [openContractorId, setOpenContractorId] = useState<string | null>(null);

  // Same SandContractorDetailPage the People page's Sand Contractor tab
  // opens, so the profile looks identical no matter which page it was
  // opened from — mirrors Soil.tsx's landowner click-through.
  if (openContractorId) {
    return <SandContractorDetailPage sandContractorId={openContractorId} onBack={() => setOpenContractorId(null)} />;
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={(Object.keys(TAB_LABEL_KEYS) as (keyof typeof TAB_LABEL_KEYS)[]).map((tabKey) => ({ value: tabKey, label: t(TAB_LABEL_KEYS[tabKey]) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "arrivals" && <SandArrivalsTab onOpenContractor={setOpenContractorId} />}
      {tab === "contracts" && <SandContractsTab onOpenContractor={setOpenContractorId} />}
    </div>
  );
}
