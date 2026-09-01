import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { DepthUnit, LandLeaseContract, LandLeaseRateType, LedgerPaymentMode } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditLandLeaseContractModalProps {
  contract: LandLeaseContract;
  onClose: () => void;
  onSaved: () => void;
}

// Exact clone of EditSoilContractModal.tsx — landId/landLeaseId aren't
// editable here, same restriction the backend enforces.
export function EditLandLeaseContractModal({ contract, onClose, onSaved }: EditLandLeaseContractModalProps) {
  const { t } = useTranslation();
  const [rateType, setRateType] = useState<LandLeaseRateType>(contract.rateType);
  const [contractedQuantity, setContractedQuantity] = useState(contract.contractedQuantity != null ? String(contract.contractedQuantity) : "");
  const [ratePerTrolley, setRatePerTrolley] = useState(contract.ratePerTrolley != null ? String(contract.ratePerTrolley) : "");
  const [contractedAreaBigha, setContractedAreaBigha] = useState(contract.contractedAreaBigha != null ? String(contract.contractedAreaBigha) : "");
  const [ratePerBigha, setRatePerBigha] = useState(contract.ratePerBigha != null ? String(contract.ratePerBigha) : "");
  const [contractedDepth, setContractedDepth] = useState(contract.contractedDepth != null ? String(contract.contractedDepth) : "");
  const [depthUnit, setDepthUnit] = useState<DepthUnit>(contract.depthUnit ?? "feet");
  const [ratePerDepthUnit, setRatePerDepthUnit] = useState(contract.ratePerDepthUnit != null ? String(contract.ratePerDepthUnit) : "");
  const [advanceAmount, setAdvanceAmount] = useState(String(contract.advanceAmount ?? 0));
  const [startDate, setStartDate] = useState(contract.startDate ? contract.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(contract.endDate ? contract.endDate.slice(0, 10) : "");
  const [paymentTerms, setPaymentTerms] = useState(contract.paymentTerms ?? "");
  const [notes, setNotes] = useState(contract.notes ?? "");
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Only the *increase* in advance (if any) posts a new PAID ledger entry
  // (see updateLandLeaseContract) — the payment-mode picker below describes
  // that increase specifically, not the contract's full advance-to-date.
  const advanceDelta = Math.round(((Number(advanceAmount) || 0) - (contract.advanceAmount ?? 0)) * 100) / 100;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rateType === "PER_TROLLEY" && (!contractedQuantity || !ratePerTrolley)) return;
    if (rateType === "PER_BIGHA" && (!contractedAreaBigha || !ratePerBigha)) return;
    if (rateType === "PER_DEPTH" && (!contractedDepth || !ratePerDepthUnit)) return;
    if (rateType === "BOTH" && (!contractedAreaBigha || !ratePerBigha || !contractedDepth || !ratePerDepthUnit)) return;
    if (advanceDelta > 0 && isPaymentSplitMismatched(paymentMode, advanceDelta, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: advanceDelta.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.landLeaseContracts.update(contract._id, {
        rateType,
        contractedQuantity: contractedQuantity ? Number(contractedQuantity) : undefined,
        ratePerTrolley: rateType === "PER_TROLLEY" ? Number(ratePerTrolley) : undefined,
        contractedAreaBigha: rateType === "PER_BIGHA" || rateType === "BOTH" ? Number(contractedAreaBigha) : undefined,
        ratePerBigha: rateType === "PER_BIGHA" || rateType === "BOTH" ? Number(ratePerBigha) : undefined,
        contractedDepth:
          (rateType === "PER_DEPTH" || rateType === "PER_BIGHA" || rateType === "BOTH") && contractedDepth ? Number(contractedDepth) : undefined,
        depthUnit: (rateType === "PER_DEPTH" || rateType === "PER_BIGHA" || rateType === "BOTH") && contractedDepth ? depthUnit : undefined,
        ratePerDepthUnit: rateType === "PER_DEPTH" || rateType === "BOTH" ? Number(ratePerDepthUnit) : undefined,
        advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
        paymentMode: advanceDelta > 0 ? paymentMode : undefined,
        cashAmount: advanceDelta > 0 && paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: advanceDelta > 0 && paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        paymentTerms: paymentTerms || undefined,
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
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
                { value: "PER_BIGHA", label: t("soil.fixedPerBigha") },
                { value: "PER_DEPTH", label: t("soil.fixedPerDepth") },
                { value: "BOTH", label: t("soil.bothBighaAndDepth") },
                { value: "PER_TROLLEY", label: t("soil.perTrolley") },
              ] as { value: LandLeaseRateType; label: string }[]
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
              <input required type="number" placeholder={t("soil.contractedQuantityTrolleys")} value={contractedQuantity} onChange={(e) => setContractedQuantity(e.target.value)} className={inputClass} />
              <input required type="number" placeholder={t("soil.ratePerTrolleyRupees")} value={ratePerTrolley} onChange={(e) => setRatePerTrolley(e.target.value)} className={inputClass} />
            </>
          )}

          {rateType === "PER_BIGHA" && (
            <>
              <input required type="number" placeholder={t("people.numberOfBighas")} value={contractedAreaBigha} onChange={(e) => setContractedAreaBigha(e.target.value)} className={inputClass} />
              <input required type="number" placeholder={t("soil.ratePerBighaRupees")} value={ratePerBigha} onChange={(e) => setRatePerBigha(e.target.value)} className={inputClass} />
              <input type="number" placeholder={t("soil.trolleyCapOptional")} value={contractedQuantity} onChange={(e) => setContractedQuantity(e.target.value)} className={inputClass} />
              <input type="number" placeholder={t("soil.depthCapOptional")} value={contractedDepth} onChange={(e) => setContractedDepth(e.target.value)} className={inputClass} />
            </>
          )}

          {rateType === "PER_DEPTH" && (
            <>
              <input required type="number" placeholder={t("soil.depthFeetPlaceholder")} value={contractedDepth} onChange={(e) => setContractedDepth(e.target.value)} className={inputClass} />
              <input required type="number" placeholder={t("soil.ratePerFeetRupees")} value={ratePerDepthUnit} onChange={(e) => setRatePerDepthUnit(e.target.value)} className={inputClass} />
              <input type="number" placeholder={t("soil.trolleyCapOptional")} value={contractedQuantity} onChange={(e) => setContractedQuantity(e.target.value)} className={inputClass} />
            </>
          )}

          {rateType === "BOTH" && (
            <>
              <input required type="number" placeholder={t("people.numberOfBighas")} value={contractedAreaBigha} onChange={(e) => setContractedAreaBigha(e.target.value)} className={inputClass} />
              <input required type="number" placeholder={t("soil.ratePerBighaRupees")} value={ratePerBigha} onChange={(e) => setRatePerBigha(e.target.value)} className={inputClass} />
              <input required type="number" placeholder={t("soil.depthFeetPlaceholder")} value={contractedDepth} onChange={(e) => setContractedDepth(e.target.value)} className={inputClass} />
              <input required type="number" placeholder={t("soil.ratePerFeetRupees")} value={ratePerDepthUnit} onChange={(e) => setRatePerDepthUnit(e.target.value)} className={inputClass} />
            </>
          )}

          <input type="number" placeholder={t("soil.advanceAmountRupees")} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className={cn(inputClass, "col-span-2")} />

          {advanceDelta > 0 && (
            <div className="col-span-2 flex flex-col gap-2">
              <label className="text-xs text-ink-muted">{t("common.howWasThisPaid")}</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
                <option value="CASH">{t("dispatch.paymentCash")}</option>
                <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                <option value="UPI">{t("dispatch.paymentUpi")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
              {paymentMode === "CASH_AND_ONLINE" && (
                <PaymentSplitFields
                  totalAmount={advanceDelta}
                  cashAmount={cashAmount}
                  onlineAmount={onlineAmount}
                  onCashAmountChange={setCashAmount}
                  onOnlineAmountChange={setOnlineAmount}
                  inputClassName={inputClass}
                />
              )}
            </div>
          )}

          <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          <input placeholder={t("soil.paymentTerms")} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={cn(inputClass, "col-span-2")} />
          <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "col-span-2")} />

          {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}

          <Button type="submit" disabled={saving} className="col-span-2">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
