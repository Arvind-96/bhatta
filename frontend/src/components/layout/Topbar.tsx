import { useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronDown, ChevronsUpDown, Hammer, LogOut, Menu, Plus, Search, Settings as SettingsIcon } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard.store";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { avatarToneSolidClass, initialsOf } from "@/lib/avatarTone";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { navItems } from "./Sidebar";

export function Topbar() {
  const status = useDashboardStore((s) => s.connectionStatus);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const kiln = kilns.find((k) => k.kilnId === activeKilnId);
  const logout = useAuthStore((s) => s.logout);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const setActiveKiln = useAuthStore((s) => s.setActiveKiln);

  const pageTitleKey = navItems.find((n) => n.view === view)?.key ?? "topbar.kilnOverview";

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return navItems.filter((item) => t(item.key).toLowerCase().includes(q)).slice(0, 6);
  }, [query, t]);

  const badge =
    status === "online"
      ? { variant: "live" as const, label: t("topbar.live"), dot: "bg-[var(--neon)]" }
      : status === "connecting"
      ? { variant: "neutral" as const, label: t("topbar.connecting"), dot: "bg-ink-muted" }
      : { variant: "critical" as const, label: t("topbar.offline"), dot: "bg-status-critical" };

  function goTo(itemView: (typeof navItems)[number]["view"]) {
    setView(itemView);
    setQuery("");
    setSearchFocused(false);
  }

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold text-ink-primary">{t(pageTitleKey)}</h1>
          <p className="truncate text-sm text-ink-muted">
            {kiln?.name ?? "Your Bhatta"} {kiln?.location ? `· ${kiln.location}` : ""}
          </p>
        </div>
      </div>
      <div className="relative hidden min-w-0 flex-1 max-w-xs md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => {
            searchBlurTimeout.current = setTimeout(() => setSearchFocused(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) goTo(matches[0].view);
            if (e.key === "Escape") { setQuery(""); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder={t("topbar.searchPlaceholder")}
          className="h-9 w-full rounded-xl border border-border bg-ink-primary/5 pl-9 pr-3 text-sm text-ink-primary outline-none transition-colors focus:border-series-1 focus:bg-surface focus:ring-2 focus:ring-series-1/30"
        />
        {searchFocused && query.trim() && (
          <div className="glass-panel absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl p-1 shadow-glass">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-muted">{t("topbar.noPagesFound")}</p>
            ) : (
              matches.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onMouseDown={() => goTo(item.view)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <Icon className="h-4 w-4 text-series-1" />
                    {t(item.key)}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          onClick={() => setView("molding")}
          className="gradient-brand hidden items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-glow-1 transition-all hover:-translate-y-0.5 hover:shadow-glow-1-lg active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:flex"
        >
          <Plus className="h-4 w-4" />
          <Hammer className="h-4 w-4" />
          <span className="hidden lg:inline">{t("topbar.logProduction")}</span>
        </button>

        <LanguageSwitcher />
        <Badge variant={badge.variant}>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot} ${status === "online" ? "animate-pulse-ring" : ""}`} />
          <span className="hidden sm:inline">{badge.label}</span>
        </Badge>

        <label className="hidden items-center gap-2 text-xs font-medium text-ink-muted sm:flex">
          <span>{isDark ? t("topbar.darkMode") : t("topbar.lightMode")}</span>
          <button
            role="switch"
            aria-checked={isDark}
            aria-label={t("topbar.toggleTheme")}
            onClick={toggleTheme}
            className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-ink-primary/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span
              className={cn(
                "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-gradient-accent2 shadow-sm transition-transform",
                isDark ? "translate-x-[18px]" : "translate-x-0.5"
              )}
            />
          </button>
        </label>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            aria-label={t("topbar.notifications")}
          >
            <Bell className="h-4 w-4" />
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} aria-hidden />
              <div className="glass-panel absolute right-0 top-full z-20 mt-1.5 w-56 rounded-xl p-3 shadow-glass">
                <p className="text-sm text-ink-muted">{t("topbar.noNotificationsYet")}</p>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-ink-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            aria-label={t("nav.settings")}
          >
            <span
              className={cn(
                "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--neon-glow)]",
                avatarToneSolidClass(activeKilnId ?? "bhatta")
              )}
            >
              {initialsOf(kiln?.name ?? "Bhatta Cloud")}
            </span>
            <ChevronDown className={cn("hidden h-3.5 w-3.5 text-ink-muted transition-transform sm:block", profileOpen && "rotate-180")} />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} aria-hidden />
              <div className="glass-panel absolute right-0 top-full z-20 mt-1.5 w-56 rounded-xl p-1.5 shadow-glass">
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-semibold text-ink-primary">{kiln?.name ?? "Bhatta Cloud"}</p>
                  <p className="truncate text-xs text-ink-muted">{kiln?.role ?? ""}</p>
                </div>
                <div className="my-1 h-px bg-border" />
                {kilns.length > 1 && (
                  <>
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">{t("topbar.switchKiln")}</p>
                    {kilns.map((k) => (
                      <button
                        key={k.kilnId}
                        onClick={() => {
                          setActiveKiln(k.kilnId);
                          setProfileOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-series-1" />
                          <span className="truncate">{k.name}</span>
                        </span>
                        {k.kilnId === activeKilnId && <Check className="h-3.5 w-3.5 shrink-0 text-series-1" />}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-border" />
                  </>
                )}
                <button
                  onClick={() => {
                    setView("settings");
                    setProfileOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <SettingsIcon className="h-4 w-4 text-series-1" />
                  {t("nav.settings")}
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-secondary hover:bg-status-critical/10 hover:text-status-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <LogOut className="h-4 w-4" />
                  {t("topbar.logout")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
