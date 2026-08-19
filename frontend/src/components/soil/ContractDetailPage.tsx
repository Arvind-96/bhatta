import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { AddSoilArrivalModal } from "@/components/soil/AddSoilArrivalModal";
import type { ContractDailyMovement, DepthUnit, Person, SoilContractStatus, SoilContractSummary } from "@/types";
import { formatDateTime, formatINR } from "@/lib/utils";

type TFunc = (key: string, params?: Record<string, string | number>) => string;

interface ContractDetailPageProps {
  contractId: string;
  onBack: () => void;
}

const CONTRACT_STATUS_VARIANT = {
  DRAFT: "neutral",
  ACTIVE: "good",
  PAUSED: "warning",
  COMPLETED: "neutral",
  CANCELLED: "critical",
} as const;

const STATUS_LABEL_KEY: Record<SoilContractStatus, string> = {
  DRAFT: "soil.statusDraft",
  ACTIVE: "common.active",
  PAUSED: "soil.statusPaused",
  COMPLETED: "soil.statusCompleted",
  CANCELLED: "soil.statusCancelled",
};

// Shared status → Hindi/English label lookup, reused by every screen that
// shows a soil contract's status Badge (ContractsTab, ContractDetailPage,
// LandDetailModal) so the wording stays identical everywhere.
export function contractStatusLabel(status: SoilContractStatus, t: TFunc): string {
  return t(STATUS_LABEL_KEY[status]);
}

// Shared depth-unit label (contracts only ever use feet or meter) — reused
// anywhere a contract's depthUnit is rendered next to a number.
export function depthUnitLabel(unit: DepthUnit | undefined, t: TFunc): string {
  return unit === "meter" ? t("soil.unitMeter") : t("soil.unitFeet");
}

function ProgressBar({ percent, critical }: { percent: number; critical?: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-primary/5">
      <div
        className={critical ? "h-full bg-status-critical" : percent >= 90 ? "h-full bg-status-warning" : "h-full bg-series-1"}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

// How this contract's price was actually negotiated — a trolley rate, a
// fixed price per bigha of field, or a fixed price per unit of excavated
// depth. See SoilContract.ts for why these are three distinct fields
// rather than one generic "rate".
export function rateBasisLabel(contract: SoilContractSummary["contract"], t: TFunc) {
  if (contract.rateType === "BOTH") {
    const unit = depthUnitLabel(contract.depthUnit, t);
    return `${t("soil.rateBighaFormula", { rate: (contract.ratePerBigha ?? 0).toLocaleString("en-IN"), area: contract.contractedAreaBigha ?? "" })} + ${t("soil.rateDepthFormula", { rate: (contract.ratePerDepthUnit ?? 0).toLocaleString("en-IN"), unit, depth: contract.contractedDepth ?? "" })}`;
  }
  if (contract.rateType === "PER_BIGHA") {
    return t("soil.rateBighaFormula", {
      rate: (contract.ratePerBigha ?? 0).toLocaleString("en-IN"),
      area: contract.contractedAreaBigha ?? "",
    });
  }
  if (contract.rateType === "PER_DEPTH") {
    const unit = depthUnitLabel(contract.depthUnit, t);
    return t("soil.rateDepthFormula", {
      rate: (contract.ratePerDepthUnit ?? 0).toLocaleString("en-IN"),
      unit,
      depth: contract.contractedDepth ?? "",
    });
  }
  return t("soil.rateTrolleyFormula", { rate: (contract.ratePerTrolley ?? 0).toLocaleString("en-IN") });
}

// A full page (not a popup) — reached by clicking a contract number in
// ContractsTab or LandDetailModal, replacing that tab's content until
// "Back to contracts" is clicked.
export function ContractDetailPage({ contractId, onBack }: ContractDetailPageProps) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<SoilContractSummary | null>(null);
  const [movement, setMovement] = useState<ContractDailyMovement[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [showAddArrival, setShowAddArrival] = useState(false);

  async function refresh() {
    const [summaryData, movementData] = await Promise.all([
      api.soilContracts.get(contractId),
      api.soilContracts.dailyMovement(contractId),
    ]);
    setSummary(summaryData);
    setMovement(movementData);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [contractId]);

  useEffect(() => {
    api.people.list("DRIVER").then(setDrivers).catch(console.error);
  }, []);

  useKilnEvent("soilContract:update", () => refresh());
  useKilnEvent("soilTrip:update", () => refresh());
  useKilnEvent("soilArrival:update", () => refresh());

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("soil.backToContracts")}
    </button>
  );

  if (!summary) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const { contract } = summary;
  const land = typeof contract.landId === "object" ? contract.landId : null;
  const landowner = typeof contract.landownerId === "object" ? contract.landownerId : null;
  const mapUrl = land?.latitude != null && land?.longitude != null ? `https://maps.google.com/?q=${land.latitude},${land.longitude}` : null;

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{contract.contractNumber}</h3>
          <p className="text-sm text-ink-muted">{land?.name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {contract.status === "ACTIVE" && landowner && (
            <Button size="sm" onClick={() => setShowAddArrival(true)}>
              <Plus className="h-4 w-4" /> {t("soil.logArrival")}
            </Button>
          )}
          <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>{contractStatusLabel(contract.status, t)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("soil.khetLocation")}</h4>
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-series-1 hover:underline">
                {t("soil.viewOnMap")} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("soil.owner")} value={landowner?.name} />
            <Field label={t("common.phone")} value={landowner?.phone} />
            <Field label={t("soil.village")} value={land?.village} />
            <Field label={t("soil.tehsilDistrict")} value={[land?.tehsil, land?.district].filter(Boolean).join(" / ") || undefined} />
            <Field label={t("soil.khasraNo")} value={land?.khasraNumber} />
            <Field label={t("soil.totalLand")} value={land?.area ? `${land.area} ${land.areaUnit}` : undefined} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("soil.mittiKaContract")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.rate")} value={rateBasisLabel(contract, t)} />
            <Field label={t("soil.totalContractValue")} value={`₹${formatINR(contract.totalContractValue)}`} />
            <Field label={t("soil.startDate")} value={contract.startDate ? new Date(contract.startDate).toLocaleDateString("en-IN") : undefined} />
            <Field label={t("soil.endDate")} value={contract.endDate ? new Date(contract.endDate).toLocaleDateString("en-IN") : undefined} />
            <Field label={t("soil.advancePaid")} value={contract.advanceAmount ? `₹${formatINR(contract.advanceAmount)}` : undefined} />
            <Field
              label={summary.ledgerBalance < 0 ? t("soil.advanceStillOutstanding") : t("soil.remainingPaymentDueToOwner")}
              value={`₹${formatINR(Math.abs(summary.ledgerBalance))}`}
            />
            <Field label={t("soil.paymentTerms")} value={contract.paymentTerms} />
            <Field label={t("common.notes")} value={contract.notes} />
            <Field label={t("common.entryDateTime")} value={formatDateTime(contract.createdAt)} />
          </div>
          {(summary.isExpired || summary.isExpiringSoon) && (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                summary.isExpired ? "bg-status-critical/10 text-status-critical" : "bg-status-warning/10 text-status-warning"
              }`}
            >
              {summary.isExpired ? t("soil.contractExpired") : t("soil.contractExpiringSoon")}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("soil.excavationMittiProgress")}</h4>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              {contract.contractedQuantity != null && summary.percentUsed != null && summary.remainingQuantity != null ? (
                <>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-muted">
                      {t("soil.uthayiGayiProgress", {
                        excavated: summary.excavatedQuantity.toLocaleString("en-IN"),
                        contracted: contract.contractedQuantity.toLocaleString("en-IN"),
                      })}
                    </span>
                    <span className={summary.overrun ? "text-status-critical" : "text-ink-secondary"}>{summary.percentUsed}%</span>
                  </div>
                  <ProgressBar percent={summary.percentUsed} critical={summary.overrun} />
                  {summary.overrun && (
                    <p className="mt-1 text-xs text-status-critical">
                      {t("soil.exceededContractedQuantity", {
                        count: (summary.excavatedQuantity - contract.contractedQuantity).toLocaleString("en-IN"),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <div>
                  <p className="text-sm text-ink-muted">{t("soil.uthayiGayiNoCap")}</p>
                  <p className="text-sm text-ink-primary">{t("soil.trolleysCountLabel", { count: summary.excavatedQuantity.toLocaleString("en-IN") })}</p>
                </div>
              )}
            </div>
            {contract.contractedDepth != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-muted">
                    {t("soil.depthReachedProgress", {
                      used: summary.depthUsedFeet,
                      contracted: contract.contractedDepth,
                      unit: depthUnitLabel(contract.depthUnit, t),
                    })}
                  </span>
                  <span className={summary.contractedDepthOverrun ? "text-status-critical" : "text-ink-secondary"}>
                    {summary.contractedDepthPercentUsed != null ? `${summary.contractedDepthPercentUsed}%` : ""}
                  </span>
                </div>
                <ProgressBar percent={summary.contractedDepthPercentUsed ?? 0} critical={summary.contractedDepthOverrun} />
                {summary.contractedDepthOverrun && (
                  <p className="mt-1 text-xs text-status-critical">
                    {t("soil.exceededContractedDepth", {
                      count: (summary.depthUsedFeet - contract.contractedDepth).toLocaleString("en-IN"),
                      unit: depthUnitLabel(contract.depthUnit, t),
                    })}
                  </p>
                )}
                {summary.contractedDepthRemaining != null && !summary.contractedDepthOverrun && (
                  <p className="mt-1 text-sm text-ink-muted">
                    {t("soil.depthRemainingLabel", { count: summary.contractedDepthRemaining, unit: depthUnitLabel(contract.depthUnit, t) })}
                  </p>
                )}
              </div>
            )}
            {summary.agreedDepthFeet != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-muted">
                    {t("soil.depthUsedAllowedDispute", { used: summary.depthUsedFeet, allowed: summary.agreedDepthFeet })}
                  </span>
                  <span className={summary.depthExceeded ? "text-status-critical" : "text-ink-secondary"}>
                    {summary.remainingDepthFeet != null ? t("soil.ftLeftLabel", { count: summary.remainingDepthFeet }) : ""}
                  </span>
                </div>
                <ProgressBar percent={(summary.depthUsedFeet / summary.agreedDepthFeet) * 100} critical={summary.depthExceeded} />
                {summary.depthExceeded && (
                  <p className="mt-1 text-xs text-status-critical">{t("soil.depthLimitExceededConfirm")}</p>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("soil.dailyMittiMovement")}</h4>
          {movement.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("soil.noTripsLoggedYet")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-ink-primary/5 text-left text-ink-muted">
                    <th className="px-3 py-2 font-medium">{t("common.date")}</th>
                    <th className="px-3 py-2 font-medium">{t("soil.trips")}</th>
                    <th className="px-3 py-2 font-medium">{t("soil.sent")}</th>
                    <th className="px-3 py-2 font-medium">{t("soil.received")}</th>
                    <th className="px-3 py-2 font-medium">{t("soil.depthHeader")}</th>
                    <th className="px-3 py-2 font-medium">{t("soil.tractorsHeader")}</th>
                    <th className="px-3 py-2 font-medium">{t("soil.driversHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movement.map((m) => (
                    <tr key={m.date} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 text-ink-secondary">{new Date(m.date).toLocaleDateString("en-IN")}</td>
                      <td className="px-3 py-2 tabular-nums text-ink-secondary">{m.tripCount}</td>
                      <td className="px-3 py-2 tabular-nums text-ink-primary">{m.trolleyCount}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {m.shortfall > 0 ? (
                          <span className="text-status-critical">
                            {m.receivedTrolleyCount} (−{m.shortfall})
                          </span>
                        ) : (
                          <span className="text-ink-primary">{m.receivedTrolleyCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-secondary">
                        {m.depthFeet != null ? `${m.depthFeet} ${depthUnitLabel(contract.depthUnit, t)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">{m.tractors.join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-ink-secondary">{m.drivers.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {showAddArrival && landowner && (
        <AddSoilArrivalModal
          landownerId={landowner._id}
          presetContractId={contract._id}
          drivers={drivers}
          onClose={() => setShowAddArrival(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
