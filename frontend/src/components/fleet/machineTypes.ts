import { useTranslation } from "@/hooks/useTranslation";
import type { MachineType } from "@/types";

// Shared by Fleet.tsx and MachineDetailPage.tsx — pulled out into its own
// module (rather than left in Fleet.tsx, a page component) so the two
// don't import from each other.
export function useMachineTypeLabels(): Record<MachineType, string> {
  const { t } = useTranslation();
  return {
    TRACTOR: t("fleet.typeTractor"),
    TRUCK: t("fleet.typeTruck"),
    JCB: t("fleet.typeJcb"),
    PUG_MILL: t("fleet.typePugMill"),
    MOLDING_MACHINE: t("fleet.typeMoldingMachine"),
    WEIGHBRIDGE: t("fleet.typeWeighbridge"),
    GENERATOR: t("fleet.typeGenerator"),
    PUMP: t("fleet.typePump"),
    BLOWER: t("fleet.typeBlower"),
    OTHER: t("fleet.typeOther"),
  };
}
