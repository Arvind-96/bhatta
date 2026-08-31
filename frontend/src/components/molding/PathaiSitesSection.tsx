import { FormEvent, useEffect, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/auth.store";
import type { PathaiSite, PathaiSiteOverviewEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function AddSiteForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.pathaiSites.create({
        name: name.trim(),
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
        <input
          required
          placeholder={t("pathaiSite.siteNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(inputClass, "col-span-2")}
        />
        <input
          type="number"
          min={0}
          step="0.1"
          placeholder={t("pathaiSite.distanceKmPlaceholder")}
          value={distanceKm}
          onChange={(e) => setDistanceKm(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder={t("common.notesOptional")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
        <Button type="submit" disabled={loading} className="col-span-2">
          {t("pathaiSite.saveSite")}
        </Button>
      </form>
    </Card>
  );
}

function SaltLogForm({ site, onClose, onLogged }: { site: PathaiSite; onClose: () => void; onLogged: () => void }) {
  const { t } = useTranslation();
  const [quantityKg, setQuantityKg] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quantityKg) return;
    setLoading(true);
    try {
      await api.saltUsageLogs.create({ siteId: site._id, quantityKg: Number(quantityKg), notes: notes || undefined });
      onLogged();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm hover:translate-y-0">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("pathaiSite.logSaltUsageFor", { name: site.name })}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            required
            type="number"
            min={0}
            step="0.1"
            placeholder={t("pathaiSite.saltQuantityKgPlaceholder")}
            value={quantityKg}
            onChange={(e) => setQuantityKg(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("common.notesOptional")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
          <Button type="submit" disabled={loading}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// A collapsible section on the Molding page: where the admin sets up
// Pathai (raw-brick molding) site locations and sees each one's live
// production picture — trolleys delivered, salt used, bricks produced,
// bricks/trolley, and current raw-brick stock. Mirrors ChamberBoard's role
// for Ghers, but for molding-ground locations instead of firing chambers.
export function PathaiSitesSection() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<PathaiSiteOverviewEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [saltLogSite, setSaltLogSite] = useState<PathaiSite | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setOverview(await api.pathaiSites.overview());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("pathaiSite:update", () => refresh());
  useKilnEvent("molding:update", () => refresh());
  useKilnEvent("soilArrival:update", () => refresh());
  useKilnEvent("stacking:update", () => refresh());

  if (!expanded && overview.length === 0) {
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
          <MapPin className="h-4 w-4" /> {t("pathaiSite.setUpSites")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary" onClick={() => setExpanded((s) => !s)}>
          <MapPin className="h-4 w-4 text-series-4" /> {t("pathaiSite.sitesSectionTitle")}
        </button>
        {expanded && (
          <Button size="sm" onClick={() => setShowAddSite((s) => !s)}>
            <Plus className="h-4 w-4" /> {t("pathaiSite.newSite")}
          </Button>
        )}
      </div>

      {expanded && (
        <>
          {showAddSite && <AddSiteForm onClose={() => setShowAddSite(false)} onCreated={refresh} />}

          {overview.length === 0 ? (
            <Card>
              <p className="py-6 text-center text-sm text-ink-muted">{t("pathaiSite.noSitesYet")}</p>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {overview.map((o) => (
                <Card key={o.site._id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-primary">{o.site.name}</p>
                      {o.site.distanceKm != null && (
                        <p className="text-sm text-ink-muted">{t("pathaiSite.distanceLabel", { km: o.site.distanceKm })}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSaltLogSite(o.site)}
                      className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                    >
                      {t("pathaiSite.logSalt")}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-semibold tabular-nums text-ink-primary">{o.currentRawStock.toLocaleString("en-IN")}</p>
                      <p className="text-sm text-ink-muted">{t("pathaiSite.currentStockLabel")}</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tabular-nums text-ink-primary">{o.totalTrolleysDelivered.toLocaleString("en-IN")}</p>
                      <p className="text-sm text-ink-muted">{t("pathaiSite.trolleysDeliveredLabel")}</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tabular-nums text-ink-primary">
                        {o.bricksPerTrolley != null ? o.bricksPerTrolley.toLocaleString("en-IN") : "—"}
                      </p>
                      <p className="text-sm text-ink-muted">{t("pathaiSite.bricksPerTrolleyLabel")}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-sm text-ink-muted">
                    <span>{t("pathaiSite.todayLabel")}: <span className="font-medium text-ink-primary">{o.bricksToday.toLocaleString("en-IN")}</span></span>
                    <span>{t("pathaiSite.thisWeekLabel")}: <span className="font-medium text-ink-primary">{o.bricksThisWeek.toLocaleString("en-IN")}</span></span>
                    <span>{t("pathaiSite.saltUsedLabel")}: <span className="font-medium text-ink-primary">{o.totalSaltUsedKg.toLocaleString("en-IN")} kg</span></span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {saltLogSite && <SaltLogForm site={saltLogSite} onClose={() => setSaltLogSite(null)} onLogged={refresh} />}
    </div>
  );
}
