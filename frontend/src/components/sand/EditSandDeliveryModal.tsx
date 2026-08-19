import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { SandContract, SandDelivery } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditSandDeliveryModalProps {
  entry: SandDelivery;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — a changed payment given/pending never silently
// rewrites the ledger entries already posted; the backend posts a
// correction entry for the difference instead (see sandDelivery.service.ts).
export function EditSandDeliveryModal({ entry, onClose, onSaved }: EditSandDeliveryModalProps) {
  const { t } = useTranslation();
  const [contractId, setContractId] = useState(entry.contractId ?? "");
  const [contracts, setContracts] = useState<SandContract[]>([]);
  const [trolleyCount, setTrolleyCount] = useState(String(entry.trolleyCount));
  const [paymentGiven, setPaymentGiven] = useState(String(entry.paymentGiven ?? 0));
  const [paymentPending, setPaymentPending] = useState(String(entry.paymentPending ?? 0));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sandContractorId = typeof entry.sandContractorId === "object" ? entry.sandContractorId._id : entry.sandContractorId;

  useEffect(() => {
    api.sandContracts.list({ sandContractorId }).then(setContracts).catch(console.error);
  }, [sandContractorId]);

  const selectedContract = contracts.find((c) => c._id === contractId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.sandDeliveries.update(entry._id, {
        contractId: contractId || undefined,
        trolleyCount: Number(trolleyCount),
        paymentGiven: Number(paymentGiven),
        paymentPending: Number(paymentPending),
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("sand.confirmDeleteDelivery"))) return;
    setDeleting(true);
    try {
      await api.sandDeliveries.remove(entry._id);
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
          <h3 className="text-sm font-semibold text-ink-primary">{t("sand.editDelivery")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          {contracts.length > 0 && (
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={`col-span-2 ${inputClass}`}>
              <option value="">{t("sand.noContractNotTracked")}</option>
              {contracts.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.contractNumber}
                </option>
              ))}
            </select>
          )}
          {selectedContract && (
            <div className="col-span-2 rounded-xl border border-border bg-ink-primary/5 p-3 text-xs">
              <p className="font-medium text-ink-primary">
                {selectedContract.rateType === "PER_TROLLEY" ? t("sand.perTrolley") : t("sand.perThousandBricks")}
                {" · ₹"}
                {formatINR(selectedContract.totalContractValue)}
              </p>
            </div>
          )}
          <input
            required
            type="number"
            placeholder={t("sand.trolleysDelivered")}
            value={trolleyCount}
            onChange={(e) => setTrolleyCount(e.target.value)}
            className={`col-span-2 ${inputClass}`}
          />
          <input
            type="number"
            placeholder={t("soil.paymentGivenRupees")}
            value={paymentGiven}
            onChange={(e) => setPaymentGiven(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder={t("soil.paymentPendingRupees")}
            value={paymentPending}
            onChange={(e) => setPaymentPending(e.target.value)}
            className={inputClass}
          />
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
