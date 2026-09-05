import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { DepthUnit, LandLeaseContract, LedgerPaymentMode } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditLandLeaseContractModalProps {
  contract: LandLeaseContract;
  onClose: () => void;
  onSaved: () => void;
}

// Bug fix (C5b): this used to be a verbatim clone of EditSoilContractModal
// — including its full 4-way rate-type switcher — even though Land Lease
// is used exclusively for raw-brick molding with no excavation quantity or
// depth to price against (the create form has never shown this picker;
// see AddLandLeaseModal.tsx). Letting an admin retroactively flip a Land
// Lease contract to PER_TROLLEY or depth-priced via Edit contradicted the
// type's own design intent, so the picker is gone and rateType is always
// PER_BIGHA — matching what create already enforces and what the backend
// schema now enforces too (landLeaseContract.controller.ts).
// landId/landLeaseId aren't editable here, same restriction the backend
// enforces.
export function EditLandLeaseContractModal({ contract, onClose, onSaved }: EditLandLeaseContractModalProps) {
  const { t } = useTranslation();
  const [contractedQuantity, setContractedQuantity] = useState(contract.contractedQuantity != null ? String(contract.contractedQuantity) : "");
  const [contractedAreaBigha, setContractedAreaBigha] = useState(contract.contractedAreaBigha != null ? String(contract.contractedAreaBigha) : "");
  const [ratePerBigha, setRatePerBigha] = useState(contract.ratePerBigha != null ? String(contract.ratePerBigha) : "");
  const [contractedDepth, setContractedDepth] = useState(contract.contractedDepth != null ? String(contract.contractedDepth) : "");
  const [depthUnit, setDepthUnit] = useState<DepthUnit>(contract.depthUnit ?? "feet");
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
    if (!contractedAreaBigha || !ratePerBigha) return;
    if (advanceDelta > 0 && isPaymentSplitMismatched(paymentMode, advanceDelta, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: advanceDelta.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.landLeaseContracts.update(contract._id, {
        rateType: "PER_BIGHA",
        contractedAreaBigha: Number(contractedAreaBigha),
        ratePerBigha: Number(ratePerBigha),
        // Optional caps, same as the create form — a PER_BIGHA contract can
        // still carry an informational trolley/depth cap without becoming
        // a different rate type.
        contractedQuantity: contractedQuantity ? Number(contractedQuantity) : undefined,
        contractedDepth: contractedDepth ? Number(contractedDepth) : undefined,
        depthUnit: contractedDepth ? depthUnit : undefined,
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
          <input required type="number" placeholder={t("people.numberOfBighas")} value={contractedAreaBigha} onChange={(e) => setContractedAreaBigha(e.target.value)} className={inputClass} />
          <input required type="number" placeholder={t("soil.ratePerBighaRupees")} value={ratePerBigha} onChange={(e) => setRatePerBigha(e.target.value)} className={inputClass} />
          <input type="number" placeholder={t("soil.trolleyCapOptional")} value={contractedQuantity} onChange={(e) => setContractedQuantity(e.target.value)} className={inputClass} />
          <input type="number" placeholder={t("soil.depthCapOptional")} value={contractedDepth} onChange={(e) => setContractedDepth(e.target.value)} className={inputClass} />

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
