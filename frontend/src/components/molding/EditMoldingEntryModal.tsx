import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { MoldingEntry } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditMoldingEntryModalProps {
  entry: MoldingEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit for a pathai entry — a revised bricksCount/rate/washedOut
// never silently rewrites the worker's wage (or the contractor's commission,
// if any); the backend posts correction entries for the deltas instead
// (see molding.service.ts's updateMoldingEntry).
export function EditMoldingEntryModal({ entry, onClose, onSaved }: EditMoldingEntryModalProps) {
  const { t } = useTranslation();
  const [bricksCount, setBricksCount] = useState(String(entry.bricksCount));
  const [ratePerThousand, setRatePerThousand] = useState(String(entry.ratePerThousand));
  const [damagedCount, setDamagedCount] = useState(entry.damagedCount ? String(entry.damagedCount) : "");
  const [damageFault, setDamageFault] = useState(entry.damageFault ?? "");
  const [washedOut, setWashedOut] = useState(entry.washedOut ?? false);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.molding.update(entry._id, {
        bricksCount: Number(bricksCount),
        ratePerThousand: Number(ratePerThousand),
        damagedCount: damagedCount ? Number(damagedCount) : 0,
        damageFault: damagedCount && damageFault ? (damageFault as "LABOURER" | "CONTRACTOR" | "OTHER") : undefined,
        washedOut,
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("molding.confirmDeleteEntry"))) return;
    setDeleting(true);
    try {
      await api.molding.remove(entry._id);
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
          <h3 className="text-sm font-semibold text-ink-primary">{t("molding.editEntry")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <input
            required
            type="number"
            placeholder={t("molding.bricksColumn")}
            value={bricksCount}
            onChange={(e) => setBricksCount(e.target.value)}
            className={inputClass}
          />
          <input
            required
            type="number"
            placeholder={t("molding.rateColumn")}
            value={ratePerThousand}
            onChange={(e) => setRatePerThousand(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            min={0}
            placeholder={t("stacking.damagedLabel")}
            value={damagedCount}
            onChange={(e) => setDamagedCount(e.target.value)}
            className={inputClass}
          />
          {Number(damagedCount) > 0 && (
            <select value={damageFault} onChange={(e) => setDamageFault(e.target.value)} className={`col-span-2 ${inputClass}`}>
              <option value="">{t("production.damageFaultPlaceholder")}</option>
              <option value="LABOURER">{t("reports.damageFault.LABOURER")}</option>
              <option value="CONTRACTOR">{t("reports.damageFault.CONTRACTOR")}</option>
              <option value="OTHER">{t("reports.damageFault.OTHER")}</option>
            </select>
          )}
          <label className="flex items-center gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary">
            <input type="checkbox" checked={washedOut} onChange={(e) => setWashedOut(e.target.checked)} />
            {t("molding.washedOutByRain")}
          </label>
          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`col-span-2 ${inputClass}`}
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
