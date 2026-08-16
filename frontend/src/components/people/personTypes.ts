import { useTranslation } from "@/hooks/useTranslation";
import type { FamilyRelation, PersonType, WorkType } from "@/types";

export function usePersonTypeMeta(): Record<PersonType, { label: string; hasWage: boolean; hasFace: boolean }> {
  const { t } = useTranslation();
  return {
    DRIVER: { label: t("people.typeDriver"), hasWage: false, hasFace: false },
    LABOUR_CONTRACTOR: { label: t("people.typeLabourContractor"), hasWage: false, hasFace: false },
    SUPPLIER: { label: t("people.typeSupplier"), hasWage: false, hasFace: false },
    THEKEDAR: { label: t("people.typeThekedar"), hasWage: false, hasFace: false },
    PARTNER: { label: t("people.typePartner"), hasWage: false, hasFace: false },
    WORKER: { label: t("people.typeWorker"), hasWage: true, hasFace: true },
    HELPER: { label: t("people.typeHelper"), hasWage: true, hasFace: true },
    LANDOWNER: { label: t("people.typeLandowner"), hasWage: false, hasFace: false },
    FITTER: { label: t("people.typeFitter"), hasWage: false, hasFace: false },
    CUSTOMER: { label: t("people.typeCustomer"), hasWage: false, hasFace: false },
    MUNIM: { label: t("people.typeMunim"), hasWage: false, hasFace: false },
    CHOWKIDAR: { label: t("people.typeChowkidar"), hasWage: false, hasFace: false },
  };
}

export function useWorkTypeLabels(): Record<WorkType, string> {
  const { t } = useTranslation();
  return {
    PATHAI: t("people.workTypePathai"),
    BHARAI_TRANSPORT: t("people.workTypeBharaiTransport"),
    PAKAYI: t("people.workTypePakayi"),
    NIKASI: t("people.workTypeNikasi"),
    LOADING: t("people.workTypeLoading"),
    BHARAI_CHAMBER_STACKING: t("people.workTypeBharaiChamberStacking"),
  };
}

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
  "CUSTOMER",
];
