import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { rateBasisLabel } from "@/components/soil/ContractDetailPage";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { Person, SoilArrival, SoilContract } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditSoilArrivalModalProps {
  entry: SoilArrival;
  drivers: Person[];
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — a changed payment given/pending never silently
// rewrites the ledger entries already posted; the backend posts a
// correction entry for the difference instead (see soilArrival.service.ts).
export function EditSoilArrivalModal({ entry, drivers, onClose, onSaved }: EditSoilArrivalModalProps) {
  const { t } = useTranslation();
  const [contractId, setContractId] = useState(entry.contractId ?? "");
  const [activeContracts, setActiveContracts] = useState<SoilContract[]>([]);
  const [jcbUsed, setJcbUsed] = useState(entry.jcbUsed);
  const [tractorUsed, setTractorUsed] = useState(entry.tractorUsed);
  const [jcbDriverId, setJcbDriverId] = useState(typeof entry.jcbDriverId === "object" ? entry.jcbDriverId?._id ?? "" : entry.jcbDriverId ?? "");
  const [tractorDriverId, setTractorDriverId] = useState(
    typeof entry.tractorDriverId === "object" ? entry.tractorDriverId?._id ?? "" : entry.tractorDriverId ?? ""
  );
  const [trolleyCount, setTrolleyCount] = useState(String(entry.trolleyCount));
  const [depthFeet, setDepthFeet] = useState(entry.depthFeet != null ? String(entry.depthFeet) : "");
  const [paymentGiven, setPaymentGiven] = useState(String(entry.paymentGiven ?? 0));
  const [paymentPending, setPaymentPending] = useState(String(entry.paymentPending ?? 0));
  const [soilRemaining, setSoilRemaining] = useState(entry.soilRemaining != null ? String(entry.soilRemaining) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const landownerId = typeof entry.landownerId === "object" ? entry.landownerId._id : entry.landownerId;

  useEffect(() => {
    api.soilContracts.list({ landownerId, status: "ACTIVE" }).then(setActiveContracts).catch(console.error);
  }, [landownerId]);

  const selectedContract = activeContracts.find((c) => c._id === contractId);
  const tracksDepth = selectedContract?.rateType === "PER_DEPTH" || selectedContract?.rateType === "PER_BIGHA";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.soilArrivals.update(entry._id, {
        contractId: contractId || undefined,
        jcbUsed,
        tractorUsed,
        jcbDriverId: jcbUsed && jcbDriverId ? jcbDriverId : undefined,
        tractorDriverId: tractorUsed && tractorDriverId ? tractorDriverId : undefined,
        trolleyCount: Number(trolleyCount),
        depthFeet: depthFeet ? Number(depthFeet) : undefined,
        paymentGiven: Number(paymentGiven),
        paymentPending: Number(paymentPending),
        soilRemaining: soilRemaining ? Number(soilRemaining) : undefined,
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("soil.confirmDeleteSoilArrival"))) return;
    setDeleting(true);
    try {
      await api.soilArrivals.remove(entry._id);
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
          <h3 className="text-sm font-semibold text-ink-primary">{t("soil.editSoilArrival")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          {activeContracts.length > 0 && (
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={`col-span-2 ${inputClass}`}>
              <option value="">{t("soil.noContract")}</option>
              {activeContracts.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.contractNumber}
                </option>
              ))}
            </select>
          )}
          {selectedContract && (
            <div className="col-span-2 rounded-xl border border-border bg-ink-primary/5 p-3 text-xs">
              <p className="mb-1 font-medium text-ink-primary">
                {selectedContract.rateType === "PER_TROLLEY" ? t("soil.perTrolley") : selectedContract.rateType === "PER_BIGHA" ? t("soil.fixedPerBigha") : t("soil.fixedPerDepth")}
                {" · "}
                {rateBasisLabel(selectedContract, t)}
              </p>
              <p className="text-ink-muted">
                {selectedContract.contractedQuantity != null &&
                  t("soil.trolleysProgressLabel", {
                    excavated: selectedContract.excavatedQuantity.toLocaleString("en-IN"),
                    contracted: selectedContract.contractedQuantity.toLocaleString("en-IN"),
                  })}
                {selectedContract.contractedDepth != null &&
                  t("soil.depthProgressLabel", {
                    used: selectedContract.depthUsedFeet,
                    contracted: selectedContract.contractedDepth,
                    unit: selectedContract.depthUnit ?? "feet",
                  })}
                {" · ₹"}
                {formatINR(Math.abs(selectedContract.ledgerBalance))}
                {" "}
                {selectedContract.ledgerBalance < 0 ? t("soil.advanceOutstandingShort") : t("soil.dueShort")}
              </p>
            </div>
          )}
          <label className="col-span-2 flex items-center gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-sm text-ink-primary">
            <input type="checkbox" checked={jcbUsed} onChange={(e) => setJcbUsed(e.target.checked)} />
            {t("soil.jcbUsed")}
          </label>
          {jcbUsed && (
            <select value={jcbDriverId} onChange={(e) => setJcbDriverId(e.target.value)} className={`col-span-2 ${inputClass}`}>
              <option value="">{t("soil.jcbDriverSelectOption")}</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <label className="col-span-2 flex items-center gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-sm text-ink-primary">
            <input type="checkbox" checked={tractorUsed} onChange={(e) => setTractorUsed(e.target.checked)} />
            {t("soil.tractorUsed")}
          </label>
          {tractorUsed && (
            <select value={tractorDriverId} onChange={(e) => setTractorDriverId(e.target.value)} className={`col-span-2 ${inputClass}`}>
              <option value="">{t("soil.tractorDriverSelectOption")}</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <input
            required
            type="number"
            placeholder={t("soil.trolleyCount")}
            value={trolleyCount}
            onChange={(e) => setTrolleyCount(e.target.value)}
            className={`col-span-2 ${inputClass}`}
          />
          {tracksDepth && (
            <input
              type="number"
              placeholder={t("soil.depthReachedUnit", { unit: selectedContract?.depthUnit ?? "feet" })}
              value={depthFeet}
              onChange={(e) => setDepthFeet(e.target.value)}
              className={`col-span-2 ${inputClass}`}
            />
          )}
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
            type="number"
            placeholder={t("soil.soilRemainingTrolleys")}
            value={soilRemaining}
            onChange={(e) => setSoilRemaining(e.target.value)}
            className={`col-span-2 ${inputClass}`}
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
              className="flex items-center gap-1.5 rounded-xl border border-status-critical/30 bg-status-critical/5 px-3.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
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
