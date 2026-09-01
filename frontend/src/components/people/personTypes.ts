import { useTranslation } from "@/hooks/useTranslation";
import type { FamilyRelation, PersonType, WorkType } from "@/types";

export function usePersonTypeMeta(): Record<PersonType, { label: string; hasWage: boolean }> {
  const { t } = useTranslation();
  return {
    DRIVER: { label: t("people.typeDriver"), hasWage: false },
    LABOUR_CONTRACTOR: { label: t("people.typeLabourContractor"), hasWage: false },
    SUPPLIER: { label: t("people.typeSupplier"), hasWage: false },
    THEKEDAR: { label: t("people.typeThekedar"), hasWage: false },
    PARTNER: { label: t("people.typePartner"), hasWage: false },
    WORKER: { label: t("people.typeWorker"), hasWage: true },
    HELPER: { label: t("people.typeHelper"), hasWage: true },
    LANDOWNER: { label: t("people.typeLandowner"), hasWage: false },
    FITTER: { label: t("people.typeFitter"), hasWage: false },
    CUSTOMER: { label: t("people.typeCustomer"), hasWage: false },
    MUNIM: { label: t("people.typeMunim"), hasWage: false },
    CHOWKIDAR: { label: t("people.typeChowkidar"), hasWage: false },
    SAND_CONTRACTOR: { label: t("people.typeSandContractor"), hasWage: false },
    SALES_AGENT: { label: t("people.typeSalesAgent"), hasWage: false },
    LAND_LEASE: { label: t("people.typeLandLease"), hasWage: false },
  };
}

export function useWorkTypeLabels(): Record<WorkType, string> {
  const { t } = useTranslation();
  return {
    PATHAI: t("people.workTypePathai"),
    BHARAI_PHAD_TO_STOCK: t("people.workTypeBharaiPhadToStock"),
    PAKAYI: t("people.workTypePakayi"),
    NIKASI: t("people.workTypeNikasi"),
    LOADING: t("people.workTypeLoading"),
    BHARAI_PHAD_TO_CHAMBER: t("people.workTypeBharaiPhadToChamber"),
    TUDI: t("people.workTypeTudi"),
    RAWAS: t("people.workTypeRawas"),
    BELDAR: t("people.workTypeBeldar"),
    BHARAI_STOCK_TO_CHAMBER: t("people.workTypeBharaiStockToChamber"),
  };
}

// The subset of WorkType that actually drives a production module's daily
// entry-logging (Molding/Stacking/Nikasi work-entry forms) — Tudi/Rawas/
// Beldar are classification-only categories with no dedicated tracking
// module, so they must never appear as a loggable work-entry choice.
export const LOGGABLE_WORK_TYPES: WorkType[] = [
  "PATHAI", "BHARAI_PHAD_TO_STOCK", "PAKAYI", "NIKASI", "LOADING", "BHARAI_PHAD_TO_CHAMBER", "BHARAI_STOCK_TO_CHAMBER",
];

export function useFamilyRelationLabels(): Record<FamilyRelation, string> {
  const { t } = useTranslation();
  return {
    SPOUSE: t("people.relationSpouse"),
    CHILD: t("people.relationChild"),
    PARENT: t("people.relationParent"),
    SIBLING: t("people.relationSibling"),
    OTHER: t("people.relationOther"),
  };
}

export const PERSON_TYPES: PersonType[] = [
  "WORKER",
  "HELPER",
  "FITTER",
  "MUNIM",
  "CHOWKIDAR",
  "LABOUR_CONTRACTOR",
  "DRIVER",
  "SUPPLIER",
  "THEKEDAR",
  "PARTNER",
  "LANDOWNER",
  "LAND_LEASE",
  "SAND_CONTRACTOR",
  "CUSTOMER",
];
