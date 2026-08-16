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
