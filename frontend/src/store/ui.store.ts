import { create } from "zustand";

export type AppView =
  | "overview"
  | "financialOverview"
  | "people"
  | "soil"
  | "sand"
  | "molding"
  | "stacking"
  | "firing"
  | "nikasi"
  | "brickLoading"
  | "dispatch"
  | "gatePass"
  | "challan"
  | "invoices"
  | "customers"
  | "expense"
  | "inventory"
  | "stock"
  | "fleet"
  | "staff"
  | "salary"
  | "attendance"
  | "reports"
  | "settings"
  | "compare"
  | "suppliers"
  | "partners"
  | "salesAgents"
  | "saleOrders"
  | "purchaseOrders"
  | "bankReconciliation";

interface UiState {
  view: AppView;
  setView: (view: AppView) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  // Set by one page right before navigating to another (e.g. clicking a
  // linked dispatch slip on the Brick Loading page) so the destination page
  // can scroll to and briefly highlight that specific record on mount. The
  // destination page clears this itself once consumed.
  highlightTarget: { view: AppView; id: string } | null;
  navigateAndHighlight: (view: AppView, id: string) => void;
  clearHighlightTarget: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "overview",
  setView: (view) => set({ view, mobileNavOpen: false }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  highlightTarget: null,
  navigateAndHighlight: (view, id) => set({ view, mobileNavOpen: false, highlightTarget: { view, id } }),
  clearHighlightTarget: () => set({ highlightTarget: null }),
}));
