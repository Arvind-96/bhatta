import { useEffect, useState } from "react";
import { Plus, Hammer, Receipt, Truck, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Overview } from "@/pages/Overview";
import { FinancialOverview } from "@/pages/FinancialOverview";
import { Compare } from "@/pages/Compare";
import { People } from "@/pages/People";
import { Soil } from "@/pages/Soil";
import { Sand } from "@/pages/Sand";
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
import { Expense } from "@/pages/Expense";
import { Inventory } from "@/pages/Inventory";
import { Stock } from "@/pages/Stock";
import { Fleet } from "@/pages/Fleet";
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
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { SetupWizard } from "@/components/onboarding/SetupWizard";

const VIEWS = {
  overview: Overview,
  financialOverview: FinancialOverview,
  compare: Compare,
  people: People,
  soil: Soil,
  sand: Sand,
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
  expense: Expense,
  inventory: Inventory,
  stock: Stock,
  fleet: Fleet,
  staff: Staff,
  salary: Salary,
  attendance: Attendance,
  reports: Reports,
  settings: Settings,
};

const QUICK_ACTIONS = [
  { key: "topbar.logProduction", icon: Hammer, view: "molding" as const, tone: "text-series-1" },
  { key: "topbar.newReceipt", icon: Receipt, view: "invoices" as const, tone: "text-series-3" },
  { key: "topbar.newSoilTrip", icon: Truck, view: "soil" as const, tone: "text-series-5" },
];

function QuickActionButton() {
  const [open, setOpen] = useState(false);
  const setView = useUiStore((s) => s.setView);
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <>
          <div className="fixed inset-0 -z-10" onClick={() => setOpen(false)} />
          <div className="glass-panel flex w-64 flex-col gap-1 rounded-2xl p-2 shadow-glass">
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              {t("topbar.quickActions")}
            </p>
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  onClick={() => {
                    setView(action.view);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-primary/5", action.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {t(action.key)}
                </button>
              );
            })}
          </div>
        </>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("topbar.quickActions")}
        className={cn(
          "gradient-brand flex h-14 w-14 items-center justify-center rounded-full text-white shadow-glow-1-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-plane",
          open && "rotate-45"
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
}

export function Dashboard() {
  useSocket();
  useLiveProduction();

  const view = useUiStore((s) => s.view);
  const ActiveView = VIEWS[view];
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
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
          <ActiveView />
        </main>
      </div>
      <QuickActionButton />
    </div>
  );
}
