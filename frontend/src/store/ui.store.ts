import { create } from "zustand";

export type AppView =
  | "overview"
  | "financialOverview"
  | "people"
  | "soil"
  | "molding"
  | "stacking"
  | "firing"
  | "nikasi"
  | "brickLoading"
  | "dispatch"
  | "gatePass"
  | "billing"
  | "expense"
  | "fuel"
  | "inventory"
  | "stock"
  | "fleet"
  | "staff"
  | "kiosk"
  | "settings";

interface UiState {
  view: AppView;
  setView: (view: AppView) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "overview",
  setView: (view) => set({ view, mobileNavOpen: false }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));
