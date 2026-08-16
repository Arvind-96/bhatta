import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { DepthUnit, SoilContract, SoilContractRateType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditSoilContractModalProps {
  contract: SoilContract;
  onClose: () => void;
  onSaved: () => void;
}

// Editing an already-active contract is a money-affecting change if the
// rate/quantity/advance is revised — the backend posts a correction entry
// for the delta rather than silently rewriting the ledger (see
// soilContract.service.ts's updateSoilContract). landId/landownerId aren't
// editable here — same restriction the backend enforces.
export function EditSoilContractModal({ contract, onClose, onSaved }: EditSoilContractModalProps) {
  const { t } = useTranslation();
  const [rateType, setRateType] = useState<SoilContractRateType>(contract.rateType);
  const [contractedQuantity, setContractedQuantity] = useState(
    contract.contractedQuantity != null ? String(contract.contractedQuantity) : ""
  );
  const [ratePerTrolley, setRatePerTrolley] = useState(contract.ratePerTrolley != null ? String(contract.ratePerTrolley) : "");
  const [contractedAreaBigha, setContractedAreaBigha] = useState(
    contract.contractedAreaBigha != null ? String(contract.contractedAreaBigha) : ""
  );
  const [ratePerBigha, setRatePerBigha] = useState(contract.ratePerBigha != null ? String(contract.ratePerBigha) : "");
  const [contractedDepth, setContractedDepth] = useState(contract.contractedDepth != null ? String(contract.contractedDepth) : "");
  const [depthUnit, setDepthUnit] = useState<DepthUnit>(contract.depthUnit ?? "feet");
  const [ratePerDepthUnit, setRatePerDepthUnit] = useState(
    contract.ratePerDepthUnit != null ? String(contract.ratePerDepthUnit) : ""
  );
  const [advanceAmount, setAdvanceAmount] = useState(String(contract.advanceAmount ?? 0));
  const [startDate, setStartDate] = useState(contract.startDate ? contract.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(contract.endDate ? contract.endDate.slice(0, 10) : "");
  const [paymentTerms, setPaymentTerms] = useState(contract.paymentTerms ?? "");
  const [notes, setNotes] = useState(contract.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rateType === "PER_TROLLEY" && (!contractedQuantity || !ratePerTrolley)) return;
    if (rateType === "PER_BIGHA" && (!contractedAreaBigha || !ratePerBigha)) return;
    if (rateType === "PER_DEPTH" && (!contractedDepth || !ratePerDepthUnit)) return;
    setSaving(true);
    try {
      await api.soilContracts.update(contract._id, {
        rateType,
        contractedQuantity: contractedQuantity ? Number(contractedQuantity) : undefined,
        ratePerTrolley: rateType === "PER_TROLLEY" ? Number(ratePerTrolley) : undefined,
        contractedAreaBigha: rateType === "PER_BIGHA" ? Number(contractedAreaBigha) : undefined,
        ratePerBigha: rateType === "PER_BIGHA" ? Number(ratePerBigha) : undefined,
        contractedDepth:
          (rateType === "PER_DEPTH" || rateType === "PER_BIGHA") && contractedDepth ? Number(contractedDepth) : undefined,
        depthUnit: (rateType === "PER_DEPTH" || rateType === "PER_BIGHA") && contractedDepth ? depthUnit : undefined,
        ratePerDepthUnit: rateType === "PER_DEPTH" ? Number(ratePerDepthUnit) : undefined,
        advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        paymentTerms: paymentTerms || undefined,
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
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("soil.editContractTitle", { contractNumber: contract.contractNumber })}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex gap-1">
            {(
              [
                { value: "PER_TROLLEY", label: t("soil.perTrolley") },
                { value: "PER_BIGHA", label: t("soil.fixedPerBigha") },
                { value: "PER_DEPTH", label: t("soil.fixedPerDepth") },
              ] as { value: SoilContractRateType; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRateType(opt.value)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  rateType === opt.value
                    ? "border-series-1 bg-series-1/10 text-series-1"
                    : "border-ink-primary/20 bg-surface text-ink-secondary hover:bg-ink-primary/10"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {rateType === "PER_TROLLEY" && (
            <>
              <input
                required
                type="number"
                placeholder={t("soil.contractedQuantityTrolleys")}
                value={contractedQuantity}
                onChange={(e) => setContractedQuantity(e.target.value)}
                className={inputClass}
              />
              <input
                required
                type="number"
                placeholder={t("soil.ratePerTrolleyRupees")}
                value={ratePerTrolley}
                onChange={(e) => setRatePerTrolley(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          {rateType === "PER_BIGHA" && (
            <>
              <input
                required
                type="number"
                placeholder={t("soil.areaBigha")}
                value={contractedAreaBigha}
                onChange={(e) => setContractedAreaBigha(e.target.value)}
                className={inputClass}
              />
              <input
                required
                type="number"
                placeholder={t("soil.ratePerBighaRupees")}
                value={ratePerBigha}
                onChange={(e) => setRatePerBigha(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("soil.trolleyCapOptional")}
                value={contractedQuantity}
                onChange={(e) => setContractedQuantity(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("soil.depthCapOptional")}
                value={contractedDepth}
                onChange={(e) => setContractedDepth(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          {rateType === "PER_DEPTH" && (
            <>
              <input
                required
                type="number"
                placeholder={t("soil.depthFeetPlaceholder")}
                value={contractedDepth}
                onChange={(e) => setContractedDepth(e.target.value)}
                className={inputClass}
              />
              <input
                required
                type="number"
                placeholder={t("soil.ratePerFeetRupees")}
                value={ratePerDepthUnit}
                onChange={(e) => setRatePerDepthUnit(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("soil.trolleyCapOptional")}
                value={contractedQuantity}
                onChange={(e) => setContractedQuantity(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          <input
            type="number"
            placeholder={t("soil.advanceAmountRupees")}
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          <input
            placeholder={t("soil.paymentTerms")}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
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
