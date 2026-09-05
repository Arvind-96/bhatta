import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { WorkEntry, WorkType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { LOGGABLE_WORK_TYPES, useWorkTypeLabels } from "./personTypes";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditWorkEntryModalProps {
  entry: WorkEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — a changed quantity/rate never silently rewrites the
// wage already posted; the backend posts a correction entry for the
// difference instead (see workEntry.service.ts).
export function EditWorkEntryModal({ entry, onClose, onSaved }: EditWorkEntryModalProps) {
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();
  const [workType, setWorkType] = useState<WorkType>(entry.workType);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [ratePerThousand, setRatePerThousand] = useState(String(entry.ratePerThousand));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.workEntries.update(entry._id, {
        workType,
        quantity: Number(quantity),
        ratePerThousand: Number(ratePerThousand),
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("people.confirmDeleteWorkEntry"))) return;
    setDeleting(true);
    try {
      await api.workEntries.remove(entry._id);
      onSaved();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setDeleting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("people.editWorkEntry")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <select value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1">
            {LOGGABLE_WORK_TYPES.map((value) => (
              <option key={value} value={value}>
                {workTypeLabels[value]}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            placeholder={t("common.quantity")}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
          <input
            required
            type="number"
            placeholder={t("people.ratePerThousandShort")}
            value={ratePerThousand}
            onChange={(e) => setRatePerThousand(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
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
