import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { Person } from "@/types";

// "Ledgers-Merge" — fixes an accidental duplicate person record by moving
// every ledger entry from `person` into another one, then deactivating
// `person`. Deliberately a two-step confirm (pick target, then a typed
// confirmation) since this is irreversible.
export function MergeLedgersModal({ person, candidates, onClose, onMerged }: { person: Person; candidates: Person[]; onClose: () => void; onMerged: () => void }) {
  const { t } = useTranslation();
  const [targetId, setTargetId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const target = candidates.find((c) => c._id === targetId);

  async function handleConfirm() {
    if (!target) return;
    setSaving(true);
    setError("");
    try {
      await api.people.mergeInto(person._id, target._id);
      onMerged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("person.mergeLedgers")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!confirming ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-secondary">{t("person.mergeLedgersInto")}</p>
            <SearchableSelect
              value={targetId}
              onChange={setTargetId}
              options={candidates.filter((c) => c._id !== person._id).map((c) => ({ value: c._id, label: c.name, sublabel: c.phone ?? undefined }))}
              placeholder={t("person.mergeLedgersTargetPlaceholder")}
            />
            <div className="flex gap-2">
              <Button disabled={!targetId} onClick={() => setConfirming(true)}>
                {t("common.continue")}
              </Button>
              <Button variant="outline" onClick={onClose}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-status-critical">{t("person.mergeLedgersConfirm", { from: person.name, into: target?.name ?? "" })}</p>
            {error && <p className="text-sm text-status-critical">{error}</p>}
            <div className="flex gap-2">
              <Button disabled={saving} onClick={handleConfirm} className="bg-status-critical hover:bg-status-critical/90">
                {saving ? t("settings.savingEllipsis") : t("common.delete")}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>,
    document.body
  );
}
