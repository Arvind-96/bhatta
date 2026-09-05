import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Overview } from "@/pages/Overview";
import { FinancialOverview } from "@/pages/FinancialOverview";
import { Compare } from "@/pages/Compare";
import { People } from "@/pages/People";
import { Soil } from "@/pages/Soil";
import { Sand } from "@/pages/Sand";
import { LandLease } from "@/pages/LandLease";
import { Molding } from "@/pages/Molding";
import { Stacking } from "@/pages/Stacking";
import { Firing } from "@/pages/Firing";
import { Nikasi } from "@/pages/Nikasi";
import { BrickLoading } from "@/pages/BrickLoading";
import { Dispatch } from "@/pages/Dispatch";
import { GatePass } from "@/pages/GatePass";
import { Challan } from "@/pages/Challan";
import { Invoices } from "@/pages/Invoices";
import { Customers } from "@/pages/Customers";
import { Suppliers } from "@/pages/Suppliers";
import { Partners } from "@/pages/Partners";
import { SalesAgents } from "@/pages/SalesAgents";
import { SaleOrders } from "@/pages/SaleOrders";
import { PurchaseOrders } from "@/pages/PurchaseOrders";
import { BankReconciliation } from "@/pages/BankReconciliation";
import { Expense } from "@/pages/Expense";
import { Inventory } from "@/pages/Inventory";
import { Stock } from "@/pages/Stock";
import { Fleet } from "@/pages/Fleet";
import { Doctor } from "@/pages/Doctor";
import { ProfitLoss } from "@/pages/ProfitLoss";
import { Staff } from "@/pages/Staff";
import { Salary } from "@/pages/Salary";
import { Attendance } from "@/pages/Attendance";
import { Reports } from "@/pages/Reports";
import { Settings } from "@/pages/Settings";
import { useSocket } from "@/hooks/useSocket";
import { useLiveProduction } from "@/hooks/useLiveProduction";
import { useUiStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";
import { SetupWizard } from "@/components/onboarding/SetupWizard";

const VIEWS = {
  overview: Overview,
  financialOverview: FinancialOverview,
  compare: Compare,
  people: People,
  soil: Soil,
  sand: Sand,
  landLease: LandLease,
  molding: Molding,
  stacking: Stacking,
  firing: Firing,
  nikasi: Nikasi,
  brickLoading: BrickLoading,
  dispatch: Dispatch,
  gatePass: GatePass,
  challan: Challan,
  invoices: Invoices,
  customers: Customers,
  suppliers: Suppliers,
  partners: Partners,
  salesAgents: SalesAgents,
  saleOrders: SaleOrders,
  purchaseOrders: PurchaseOrders,
  expense: Expense,
  inventory: Inventory,
  stock: Stock,
  fleet: Fleet,
  doctor: Doctor,
  profitLoss: ProfitLoss,
  staff: Staff,
  salary: Salary,
  attendance: Attendance,
  bankReconciliation: BankReconciliation,
  reports: Reports,
  settings: Settings,
};

export function Dashboard() {
  useSocket();
  useLiveProduction();

  const view = useUiStore((s) => s.view);
  const ActiveView = VIEWS[view];
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeSeasonId = useAuthStore((s) => s.activeSeasonId);
  const setSeasons = useAuthStore((s) => s.setSeasons);
  const needsSetup = kilns.find((k) => k.kilnId === activeKilnId)?.needsSetup ?? false;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  // Seasons are per-kiln (setActiveKiln/setKilns already clear the prior
  // kiln's list to avoid a stale X-Season-Id) — re-fetched every time the
  // active kiln changes, including the very first mount right after
  // App.tsx's bootstrapPublicKiln sets it.
  useEffect(() => {
    if (!activeKilnId) return;
    api.seasons.list().then(setSeasons).catch(console.error);
  }, [activeKilnId, setSeasons]);

  if (needsSetup) {
    return <SetupWizard />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-plane">
      <Topbar />
      <div className="flex min-w-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 p-4 sm:p-6 sm:m-4 sm:bg-surface sm:rounded-2xl sm:border sm:border-border sm:shadow-sm">
          {/* Remounting on activeSeasonId forces every page's data-fetch
              effects to re-run from scratch when the admin switches season
              — pages only key their own fetches off activeKilnId, so
              without this a page already mounted before a season switch
              would keep showing the old season's data until the user
              navigated away and back. */}
          <ActiveView key={activeSeasonId} />
        </main>
      </div>
    </div>
  );
}
