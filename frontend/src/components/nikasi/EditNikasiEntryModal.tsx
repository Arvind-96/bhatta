import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { NikasiEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditNikasiEntryModalProps {
  entry: NikasiEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit for a nikasi entry — no wage is tied to bricksCount (the
// gang is on a fixed monthly salary), so this is just correcting the
// production record, no ledger side effect.
export function EditNikasiEntryModal({ entry, onClose, onSaved }: EditNikasiEntryModalProps) {
  const { t } = useTranslation();
  const [bricksCount, setBricksCount] = useState(String(entry.bricksCount));
  const [damagedCount, setDamagedCount] = useState(entry.damagedCount ? String(entry.damagedCount) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.nikasi.update(entry._id, {
        bricksCount: Number(bricksCount),
        damagedCount: damagedCount ? Number(damagedCount) : 0,
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("nikasi.confirmDeleteEntry"))) return;
    setDeleting(true);
    try {
      await api.nikasi.remove(entry._id);
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
          <h3 className="text-sm font-semibold text-ink-primary">{t("nikasi.editEntry")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2">
          <input
            required
            type="number"
            placeholder={t("nikasi.bricksUnloadedPlaceholder")}
            value={bricksCount}
            onChange={(e) => setBricksCount(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            min={0}
            placeholder={t("nikasi.damagedBricksPlaceholder")}
            value={damagedCount}
            onChange={(e) => setDamagedCount(e.target.value)}
            className={inputClass}
          />
          <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          <div className="flex gap-2">
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
