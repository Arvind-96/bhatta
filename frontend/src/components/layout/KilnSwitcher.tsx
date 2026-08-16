import { useState } from "react";
import { ChevronsUpDown, Check, Plus, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

export function KilnSwitcher() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setActiveKiln = useAuthStore((s) => s.setActiveKiln);
  const setKilns = useAuthStore((s) => s.setKilns);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  const active = kilns.find((k) => k.kilnId === activeKilnId);

  // With only one bhatta there's nothing to switch between — a plain,
  // unclickable label instead of a dropdown trigger, so there's no floating
  // panel here at all for the common single-kiln account.
  if (kilns.length <= 1) {
    return (
      <div className="mx-2 rounded-xl border border-sidebar-line bg-sidebar-raised px-3 py-2 text-sm text-sidebar-ink">
        <p className="truncate font-medium">{active?.name ?? t("overview.selectBhatta")}</p>
        <p className="truncate text-sm text-sidebar-ink-soft">{active?.role ?? ""}</p>
      </div>
    );
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await api.kilns.create(newName.trim());
      const refreshed = await api.kilns.list();
      setKilns(refreshed);
      const created = refreshed.find((k) => k.name === newName.trim());
      if (created) setActiveKiln(created.kilnId);
      setNewName("");
      setCreating(false);
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative px-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-sidebar-line bg-sidebar-raised px-3 py-2 text-left text-sm text-sidebar-ink hover:bg-sidebar-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{active?.name ?? t("overview.selectBhatta")}</p>
          <p className="truncate text-sm text-sidebar-ink-soft">{active?.role ?? ""}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-ink-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10 bg-ink-primary/40 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="glass-panel absolute left-2 right-2 top-full z-20 mt-1 rounded-xl p-1 shadow-glass">
          {kilns.map((k) => (
            <button
              key={k.kilnId}
              onClick={() => {
                setActiveKiln(k.kilnId);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-ink-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                k.kilnId === activeKilnId ? "text-ink-primary" : "text-ink-secondary"
              )}
            >
              <span className="truncate">{k.name}</span>
              {k.kilnId === activeKilnId && <Check className="h-3.5 w-3.5 shrink-0 text-series-1" />}
            </button>
          ))}

          <div className="my-1 h-px bg-border" />

          {creating ? (
            <div className="flex items-center gap-1 p-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("overview.newBhattaName")}
                className="h-8 flex-1 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink-muted hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("overview.addBhatta")}
            </button>
          )}
          </div>
        </>
      )}
    </div>
  );
}
