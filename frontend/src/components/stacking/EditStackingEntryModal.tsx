import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { StackingEntry, StackingStage } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditStackingEntryModalProps {
  entry: StackingEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit for a bharai entry — bricksCount/rate changes don't
// silently rewrite the wage already posted to the gang's ledger; the
// backend posts a correction entry for the difference instead (see
// stacking.service.ts's updateStackingEntry).
export function EditStackingEntryModal({ entry, onClose, onSaved }: EditStackingEntryModalProps) {
  const { t } = useTranslation();
  const [bricksCount, setBricksCount] = useState(String(entry.bricksCount));
  const [damageCount, setDamageCount] = useState(String(entry.damageCount));
  const [stage, setStage] = useState<"" | StackingStage>(entry.stage ?? "");
  const [qualityRating, setQualityRating] = useState(entry.qualityRating);
  const [mode, setMode] = useState<"" | "BUGGI" | "TRACTOR">(entry.mode ?? "");
  const [tractorNumber, setTractorNumber] = useState(entry.tractorNumber ?? "");
  const [buggiCount, setBuggiCount] = useState(entry.buggiCount ? String(entry.buggiCount) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.stacking.update(entry._id, {
        bricksCount: Number(bricksCount),
        damageCount: Number(damageCount),
        stage: stage || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
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
          <select value={stage} onChange={(e) => setStage(e.target.value as "" | StackingStage)} className={inputClass}>
            <option value="">{t("stacking.stageNotSet")}</option>
            <option value="TRANSPORT">{t("stacking.stage1TransportShort")}</option>
            <option value="CHAMBER_STACKING">{t("stacking.stage2Label")}</option>
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
          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
          <Button type="submit" disabled={saving} className="col-span-2">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
