import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { PathaiSite, StackingEntry, StackingStage } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditStackingEntryModalProps {
  entry: StackingEntry;
  sites?: PathaiSite[];
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit for a bharai entry — bricksCount/rate changes don't
// silently rewrite the wage already posted to the gang's ledger; the
// backend posts a correction entry for the difference instead (see
// stacking.service.ts's updateStackingEntry).
export function EditStackingEntryModal({ entry, sites = [], onClose, onSaved }: EditStackingEntryModalProps) {
  const { t } = useTranslation();
  const [bricksCount, setBricksCount] = useState(String(entry.bricksCount));
  const [damageCount, setDamageCount] = useState(String(entry.damageCount));
  const [damageFault, setDamageFault] = useState(entry.damageFault ?? "");
  const [stage, setStage] = useState<"" | StackingStage>(entry.stage ?? "");
  const [qualityRating, setQualityRating] = useState(entry.qualityRating);
  const [mode, setMode] = useState<"" | "BUGGI" | "TRACTOR">(entry.mode ?? "");
  const [tractorNumber, setTractorNumber] = useState(entry.tractorNumber ?? "");
  const [buggiCount, setBuggiCount] = useState(entry.buggiCount ? String(entry.buggiCount) : "");
  // Bug fix: this used to have no siteId control at all, even though both
  // the update schema and the create form (for PHAD_TO_STOCK entries)
  // support it — a wrongly-picked site could never be corrected after
  // the fact.
  const [siteId, setSiteId] = useState(entry.siteId ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.stacking.update(entry._id, {
        bricksCount: Number(bricksCount),
        damageCount: Number(damageCount),
        damageFault: Number(damageCount) > 0 && damageFault ? (damageFault as "LABOURER" | "CONTRACTOR" | "OTHER") : undefined,
        stage: stage || undefined,
        siteId: stage === "PHAD_TO_STOCK" ? siteId || undefined : undefined,
        qualityRating,
        mode: mode || undefined,
        tractorNumber: mode === "TRACTOR" ? tractorNumber || undefined : undefined,
        buggiCount: mode === "BUGGI" && buggiCount ? Number(buggiCount) : undefined,
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("stacking.confirmDeleteEntry"))) return;
    setDeleting(true);
    try {
      await api.stacking.remove(entry._id);
      onSaved();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("stacking.editBharaiEntry")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <input
            required
            type="number"
            placeholder={t("stacking.bricksStackedPlaceholder")}
            value={bricksCount}
            onChange={(e) => setBricksCount(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder={t("stacking.damagedCountPlaceholder")}
            value={damageCount}
            onChange={(e) => setDamageCount(e.target.value)}
            className={inputClass}
          />
          {Number(damageCount) > 0 && (
            <select value={damageFault} onChange={(e) => setDamageFault(e.target.value)} className={cn(inputClass, "col-span-2")}>
              <option value="">{t("production.damageFaultPlaceholder")}</option>
              <option value="LABOURER">{t("reports.damageFault.LABOURER")}</option>
              <option value="CONTRACTOR">{t("reports.damageFault.CONTRACTOR")}</option>
              <option value="OTHER">{t("reports.damageFault.OTHER")}</option>
            </select>
          )}
          <select value={stage} onChange={(e) => setStage(e.target.value as "" | StackingStage)} className={inputClass}>
            <option value="">{t("stacking.stageNotSet")}</option>
            <option value="PHAD_TO_STOCK">{t("stacking.stage1Label")}</option>
            <option value="STOCK_TO_CHAMBER">{t("stacking.stage2Label")}</option>
          </select>
          <select value={qualityRating} onChange={(e) => setQualityRating(e.target.value as StackingEntry["qualityRating"])} className={inputClass}>
            <option value="GOOD">{t("stacking.goodSetting")}</option>
            <option value="AVERAGE">{t("stacking.averageSetting")}</option>
            <option value="POOR">{t("stacking.poorSetting")}</option>
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value as "" | "BUGGI" | "TRACTOR")} className={cn(inputClass, "col-span-2")}>
            <option value="">{t("stacking.modeNotSet")}</option>
            <option value="BUGGI">{t("stacking.buggiOption")}</option>
            <option value="TRACTOR">{t("stacking.tractorOption")}</option>
          </select>
          {mode === "TRACTOR" && (
            <input
              placeholder={t("stacking.tractorNumberPlaceholder")}
              value={tractorNumber}
              onChange={(e) => setTractorNumber(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
          )}
          {mode === "BUGGI" && (
            <input
              type="number"
              placeholder={t("stacking.numberOfBuggisEngagedPlaceholder")}
              value={buggiCount}
              onChange={(e) => setBuggiCount(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
          )}
          {stage === "PHAD_TO_STOCK" && sites.length > 0 && (
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={cn(inputClass, "col-span-2")}>
              <option value="">{t("pathaiSite.transportedFromSiteOptional")}</option>
              {sites.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
          <div className="col-span-2 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-status-critical/30 bg-status-critical/5 px-3.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
            <Button type="submit" disabled={saving} className="flex-1">
              {t("common.saveChanges")}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
