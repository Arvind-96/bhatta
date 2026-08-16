import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { contractStatusLabel, rateBasisLabel } from "./ContractDetailPage";
import { useTranslation } from "@/hooks/useTranslation";
import type { Land, SoilContract } from "@/types";

interface LandDetailModalProps {
  landId: string;
  onClose: () => void;
  // Clicking a contract navigates away to the full contract page (see
  // ContractDetailPage) rather than opening a second, nested modal.
  onOpenContract: (contractId: string) => void;
}

const CONTRACT_STATUS_VARIANT = {
  DRAFT: "neutral",
  ACTIVE: "good",
  PAUSED: "warning",
  COMPLETED: "neutral",
  CANCELLED: "critical",
} as const;

// The "jis ke khet ke sath contract hai" drill-down: open one khet and see
// its owner info plus every contract — past and present — ever made
// against it in one place, each clickable through to the full breakdown.
export function LandDetailModal({ landId, onClose, onOpenContract }: LandDetailModalProps) {
  const { t } = useTranslation();
  const [land, setLand] = useState<Land | null>(null);
  const [contracts, setContracts] = useState<SoilContract[]>([]);

  async function refresh() {
    const [landData, contractsData] = await Promise.all([api.lands.get(landId), api.soilContracts.list({ landId })]);
    setLand(landData);
    setContracts(contractsData);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [landId]);

  useKilnEvent("land:update", () => refresh());
  useKilnEvent("soilContract:update", () => refresh());

  if (!land) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="w-full max-w-lg">
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const owner = typeof land.landownerId === "object" ? land.landownerId : null;
  const mapUrl = land.latitude != null && land.longitude != null ? `https://maps.google.com/?q=${land.latitude},${land.longitude}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{land.name}</h3>
              <p className="text-sm text-ink-muted">
                {owner?.name ?? "—"} {owner?.phone ? `· ${owner.phone}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-series-1 hover:underline">
                  {t("soil.mapLink")} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-ink-primary/5 p-3 text-sm">
            <div>
              <p className="text-sm text-ink-muted">{t("soil.villageTehsil")}</p>
              <p className="text-ink-primary">{[land.village, land.tehsil].filter(Boolean).join(" / ") || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t("soil.khasraNo")}</p>
              <p className="text-ink-primary">{land.khasraNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t("soil.totalArea")}</p>
              <p className="text-ink-primary">{land.area ? `${land.area} ${land.areaUnit}` : "—"}</p>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t("soil.excavatedSoFar")}</p>
              <p className="text-ink-primary">
                {land.excavatedQuantity.toLocaleString("en-IN")}
                {land.estimatedSoilQuantity ? ` / ${land.estimatedSoilQuantity.toLocaleString("en-IN")}` : ""} {t("soil.trolleysUnit")}
              </p>
            </div>
          </div>

          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("soil.contractsOnThisKhet", { count: contracts.length })}
          </h4>
          {contracts.length === 0 ? (
            <p className="rounded-xl border border-border bg-ink-primary/5 py-6 text-center text-sm text-ink-muted">
              {t("soil.noContractsOnKhet")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {contracts.map((c) => (
                <button
                  key={c._id}
                  onClick={() => {
                    onClose();
                    onOpenContract(c._id);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-ink-primary/5 px-3 py-2 text-left text-sm hover:bg-ink-primary/10"
                >
                  <div>
                    <p className="text-ink-primary">{c.contractNumber}</p>
                    <p className="text-sm text-ink-muted">
                      {rateBasisLabel(c, t)}
                      {c.startDate ? t("soil.fromDateSuffix", { date: new Date(c.startDate).toLocaleDateString("en-IN") }) : ""}
                    </p>
                  </div>
                  <Badge variant={CONTRACT_STATUS_VARIANT[c.status]}>{contractStatusLabel(c.status, t)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
    </div>
  );
}
