import { MouseEvent, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { contractStatusLabel } from "@/components/soil/ContractDetailPage";
import { LandLeaseDetailPage } from "@/components/landLease/LandLeaseDetailPage";
import type { LandLeaseContract, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const CONTRACT_STATUS_VARIANT = {
  DRAFT: "neutral",
  ACTIVE: "good",
  PAUSED: "warning",
  COMPLETED: "neutral",
  CANCELLED: "critical",
} as const;

// The Land Lease (Patta) page — same structure as Soil/Sand, but scoped
// down to exactly the "Contracts" tab: this land is leased purely for
// molding-ground use, so there's no daily "arrival"/"delivery" workflow
// to log against it the way soil/sand have, just the lease contract
// itself (see AddLandLeaseModal's own PER_BIGHA-only rate section).
export function LandLease() {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<LandLeaseContract[]>([]);
  const [landLeases, setLandLeases] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [openLandLeaseId, setOpenLandLeaseId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  // Contracts are only ever created via the People page's Add Land Lease
  // flow, or later from a land-lease person's own profile ("New
  // Contract") — this page is a read-only listing of whatever contracts
  // already exist, so it has no creation form of its own. Also fetches
  // every Land Lease person (not just ones with a contract) so one added
  // without filling in the optional contract fields still shows up here.
  async function refresh() {
    const [contractsData, landLeasesData] = await Promise.all([
      api.landLeaseContracts.list(),
      api.people.list("LAND_LEASE"),
    ]);
    setContracts(contractsData);
    setLandLeases(landLeasesData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("landLeaseContract:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function remove(contract: LandLeaseContract, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("soil.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    await api.landLeaseContracts.remove(contract._id);
    refresh();
  }

  const landLeaseIdsWithContract = new Set(
    contracts.map((c) => (typeof c.landLeaseId === "object" ? c.landLeaseId._id : c.landLeaseId))
  );
  const landLeasesWithoutContract = landLeases.filter((l) => !landLeaseIdsWithContract.has(l._id));

  const filteredContracts = contracts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const owner = typeof c.landLeaseId === "object" ? c.landLeaseId : null;
    return c.contractNumber.toLowerCase().includes(q) || (owner?.name ?? "").toLowerCase().includes(q) || (owner?.phone ?? "").includes(q);
  });
  const { page, setPage, pageCount, pageItems: pagedContracts, total } = usePagination(filteredContracts, 10);

  const totalContractValue = contracts.reduce((sum, c) => sum + c.totalContractValue, 0);
  const totalArea = contracts.reduce((sum, c) => sum + (c.contractedAreaBigha ?? 0), 0);

  if (openLandLeaseId) {
    return <LandLeaseDetailPage landLeaseId={openLandLeaseId} onBack={() => setOpenLandLeaseId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.totalContracts")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{contracts.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("people.landHoldings")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalArea.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("people.unitBigha")}</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.totalContractValue")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalContractValue)}</p>
        </Card>
      </div>

      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          placeholder={t("soil.searchContractsPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(inputClass, "w-72 pl-9")}
        />
      </div>

      {landLeasesWithoutContract.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("landLease.noContractYetHeading")}</p>
          <div className="flex flex-wrap gap-2">
            {landLeasesWithoutContract.map((l) => (
              <button
                key={l._id}
                onClick={() => setOpenLandLeaseId(l._id)}
                className="flex items-center gap-2 rounded-full border border-border bg-ink-primary/5 px-3 py-1.5 text-sm text-ink-secondary hover:border-series-1/40 hover:bg-series-1/5 hover:text-ink-primary"
              >
                {l.name}
                <Badge variant="neutral">{t("soil.noContractYet")}</Badge>
              </button>
            ))}
          </div>
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
                  <th className="pb-2 font-medium">{t("people.landLease")}</th>
                  <th className="pb-2 font-medium">{t("people.numberOfBighas")}</th>
                  <th className="pb-2 font-medium">{t("soil.valueHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.status")}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pagedContracts.map((c) => {
                  const owner = typeof c.landLeaseId === "object" ? c.landLeaseId : null;
                  return (
                    <tr
                      key={c._id}
                      onClick={() => owner && setOpenLandLeaseId(owner._id)}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                    >
                      <td className="py-3 text-ink-primary">{c.contractNumber}</td>
                      <td className="py-3 text-ink-secondary">{owner ? owner.name : "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">
                        {c.contractedAreaBigha != null ? c.contractedAreaBigha.toLocaleString("en-IN") : "—"}
                        {c.ratePerBigha != null ? ` · ₹${formatINR(c.ratePerBigha)}/${t("people.unitBigha")}` : ""}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(c.totalContractValue)}</td>
                      <td className="py-3">
                        <Badge variant={CONTRACT_STATUS_VARIANT[c.status]}>{contractStatusLabel(c.status, t)}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={(e) => remove(c, e)} className="text-xs font-medium text-status-critical hover:underline">
                          {t("common.delete")}
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
    </div>
  );
}
