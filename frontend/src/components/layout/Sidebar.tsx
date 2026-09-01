import { Flame, LayoutGrid, Layers, CalendarCheck, Settings as SettingsIcon, Thermometer, Truck, Users, UserSquare2, Hammer, PackageCheck, ArrowDownToLine, PackagePlus, UserCog, ClipboardCheck, FileText, Receipt, Wallet, Boxes, Warehouse, PieChart, Banknote, FileSearch, GitCompare, Mountain, Container, Handshake, UserCheck, ClipboardList, Landmark, MapPinned, Wrench, Stethoscope, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { KilnSwitcher } from "./KilnSwitcher";
import { useUiStore, type AppView } from "@/store/ui.store";
import { useTranslation } from "@/hooks/useTranslation";

// Each item gets its own accent from the 6-color series palette, shown as
// a small tinted icon chip — cycled rather than left flat brand-blue, so
// the rail reads as colorful and varied even before anything is selected.
type SeriesTone = "text-series-1" | "text-series-2" | "text-series-3" | "text-series-4" | "text-series-5" | "text-series-6";
const TONES: SeriesTone[] = ["text-series-1", "text-series-2", "text-series-3", "text-series-4", "text-series-5", "text-series-6"];
const CHIP_BG: Record<SeriesTone, string> = {
  "text-series-1": "bg-series-1/15",
  "text-series-2": "bg-series-2/15",
  "text-series-3": "bg-series-3/15",
  "text-series-4": "bg-series-4/15",
  "text-series-5": "bg-series-5/15",
  "text-series-6": "bg-series-6/15",
};

export const navItems: { key: string; icon: typeof LayoutGrid; view: AppView; group: string }[] = [
  { key: "nav.overview", icon: LayoutGrid, view: "overview", group: "nav.group.dashboard" },
  { key: "nav.financialOverview", icon: PieChart, view: "financialOverview", group: "nav.group.dashboard" },
  { key: "nav.compare", icon: GitCompare, view: "compare", group: "nav.group.dashboard" },

  { key: "nav.people", icon: Users, view: "people", group: "nav.group.production" },
  { key: "nav.soil", icon: Truck, view: "soil", group: "nav.group.production" },
  { key: "nav.sand", icon: Mountain, view: "sand", group: "nav.group.production" },
  { key: "nav.landLease", icon: MapPinned, view: "landLease", group: "nav.group.production" },
  { key: "nav.molding", icon: Hammer, view: "molding", group: "nav.group.production" },
  { key: "nav.stacking", icon: Layers, view: "stacking", group: "nav.group.production" },
  { key: "nav.firing", icon: Thermometer, view: "firing", group: "nav.group.production" },
  { key: "nav.nikasi", icon: ArrowDownToLine, view: "nikasi", group: "nav.group.production" },
  { key: "nav.brickLoading", icon: PackagePlus, view: "brickLoading", group: "nav.group.production" },

  { key: "nav.dispatch", icon: PackageCheck, view: "dispatch", group: "nav.group.trade" },
  { key: "nav.gatePass", icon: ClipboardCheck, view: "gatePass", group: "nav.group.trade" },
  { key: "nav.challan", icon: FileText, view: "challan", group: "nav.group.trade" },
  { key: "nav.invoices", icon: Receipt, view: "invoices", group: "nav.group.trade" },
  { key: "nav.customers", icon: UserSquare2, view: "customers", group: "nav.group.trade" },
  { key: "nav.suppliers", icon: Container, view: "suppliers", group: "nav.group.trade" },
  { key: "nav.partners", icon: Handshake, view: "partners", group: "nav.group.trade" },
  { key: "nav.salesAgents", icon: UserCheck, view: "salesAgents", group: "nav.group.trade" },
  { key: "nav.saleOrders", icon: ClipboardList, view: "saleOrders", group: "nav.group.trade" },
  { key: "nav.purchaseOrders", icon: ClipboardList, view: "purchaseOrders", group: "nav.group.trade" },
  { key: "nav.expense", icon: Wallet, view: "expense", group: "nav.group.trade" },

  { key: "nav.inventory", icon: Boxes, view: "inventory", group: "nav.group.resources" },
  { key: "nav.stock", icon: Warehouse, view: "stock", group: "nav.group.resources" },
  { key: "nav.fleet", icon: Wrench, view: "fleet", group: "nav.group.resources" },

  { key: "nav.staff", icon: UserCog, view: "staff", group: "nav.group.admin" },
  { key: "nav.salary", icon: Banknote, view: "salary", group: "nav.group.admin" },
  { key: "nav.attendance", icon: CalendarCheck, view: "attendance", group: "nav.group.admin" },
  { key: "nav.doctor", icon: Stethoscope, view: "doctor", group: "nav.group.admin" },
  { key: "nav.bankReconciliation", icon: Landmark, view: "bankReconciliation", group: "nav.group.admin" },
  { key: "nav.reports", icon: FileSearch, view: "reports", group: "nav.group.admin" },
  { key: "nav.settings", icon: SettingsIcon, view: "settings", group: "nav.group.admin" },
];

const GROUPS = ["nav.group.dashboard", "nav.group.production", "nav.group.trade", "nav.group.resources", "nav.group.admin"];

// Shared nav-list body used by both the fixed desktop rail and the mobile
// slide-over drawer, so the two never drift out of sync with each other.
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <div className="gradient-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-glow-1">
          <Flame className="h-4 w-4 text-white" />
        </div>
        <span className="font-display text-base font-semibold text-sidebar-ink">{t("app.name")}</span>
        <span className="ml-auto animate-gradient-flow gradient-accent2 rounded bg-[length:200%_200%] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow-[0_0_10px_-2px_var(--neon-glow)]">
          Live
        </span>
      </div>

      <KilnSwitcher />

      <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-ink-faint">
              {t(group)}
            </span>
            {navItems
              .filter((item) => item.group === group)
              .map(({ key, icon: Icon, view: itemView }) => {
                const active = view === itemView;
                const tone = TONES[navItems.findIndex((n) => n.view === itemView) % TONES.length];
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setView(itemView);
                      onNavigate?.();
                    }}
                    className={cn(
                      "flex shrink-0 items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                      active
                        ? "gradient-brand text-white shadow-glow-1"
                        : "text-sidebar-ink-soft hover:bg-sidebar-line/60 hover:text-sidebar-ink"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        active ? "bg-white/20" : CHIP_BG[tone]
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : tone)} />
                    </span>
                    {t(key)}
                  </button>
                );
              })}
          </div>
        ))}
      </nav>
    </>
  );
}

export function Sidebar() {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <>
      {/* Desktop rail — pinned to the viewport so it never scrolls out of
          view with tall page content; its own nav list scrolls internally
          if it doesn't fit. */}
      <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-60 shrink-0 flex-col gap-6 bg-sidebar px-4 py-6 lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile/tablet drawer — below the `lg` breakpoint the rail above is
          hidden entirely, so this is the only way to navigate; it's opened
          from the Topbar's menu button. */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-primary/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col gap-6 bg-sidebar px-4 py-6 shadow-glass">
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-ink-soft hover:bg-sidebar-line hover:text-sidebar-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
