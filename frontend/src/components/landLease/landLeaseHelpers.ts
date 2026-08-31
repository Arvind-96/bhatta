import { depthUnitLabel } from "@/components/soil/ContractDetailPage";
import type { LandLeaseContract, LandLeaseContractStatus } from "@/types";

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const STATUS_LABEL_KEY: Record<LandLeaseContractStatus, string> = {
  DRAFT: "soil.statusDraft",
  ACTIVE: "common.active",
  PAUSED: "soil.statusPaused",
  COMPLETED: "soil.statusCompleted",
  CANCELLED: "soil.statusCancelled",
};

// Exact clone of ContractDetailPage.tsx's contractStatusLabel/rateBasisLabel,
// typed against LandLeaseContract instead of SoilContract (the two types
// share the same rate-basis fields but aren't structurally identical —
// SoilContract carries excavation-tracking fields Land Lease has none of).
export function landLeaseContractStatusLabel(status: LandLeaseContractStatus, t: TFunc): string {
  return t(STATUS_LABEL_KEY[status]);
}

export function landLeaseRateBasisLabel(contract: LandLeaseContract, t: TFunc) {
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
