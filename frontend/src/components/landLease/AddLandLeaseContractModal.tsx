import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { Land, LedgerPaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddLandLeaseContractModalProps {
  landLeaseId: string;
  lands: Land[];
  onClose: () => void;
  onCreated: () => void;
}

// A contract for a Land Lease (Patta) person who was added without one —
// exact clone of AddSoilContractModal.tsx, kept as its own component/table
// so it never shows up on the Soil (Mitti) page. Always PER_BIGHA — this
// land is used exclusively for raw-brick molding, so there's no
// excavation quantity or depth to price against, matching
// AddLandLeaseModal's own embedded contract section.
export function AddLandLeaseContractModal({ landLeaseId, lands, onClose, onCreated }: AddLandLeaseContractModalProps) {
  const { t } = useTranslation();
  const [landId, setLandId] = useState(lands[0]?._id ?? "");
  const [contractedAreaBigha, setContractedAreaBigha] = useState("");
  const [ratePerBigha, setRatePerBigha] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!landId) return;
    if (!contractedAreaBigha || !ratePerBigha) return;
    if (isPaymentSplitMismatched(paymentMode, Number(advanceAmount) || 0, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(advanceAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.landLeaseContracts.create({
        landId,
        landLeaseId,
        rateType: "PER_BIGHA",
        contractedAreaBigha: Number(contractedAreaBigha),
        ratePerBigha: Number(ratePerBigha),
        advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
        paymentMode: advanceAmount ? paymentMode : undefined,
        cashAmount: advanceAmount && paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: advanceAmount && paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        paymentTerms: paymentTerms || undefined,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("landLease.newContract")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <select required value={landId} onChange={(e) => setLandId(e.target.value)} className={cn(inputClass, "col-span-2")}>
            <option value="">{t("soil.selectLand")}</option>
            {lands.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
                {l.khasraNumber ? ` — ${l.khasraNumber}` : ""}
              </option>
            ))}
          </select>

          <div className="col-span-2 flex gap-1">
            <span className="flex-1 rounded-lg border border-series-1 bg-series-1/10 px-2 py-2 text-center text-xs font-medium text-series-1">
              {t("soil.fixedPerBigha")}
            </span>
          </div>

          <input required type="number" placeholder={t("people.numberOfBighas")} value={contractedAreaBigha} onChange={(e) => setContractedAreaBigha(e.target.value)} className={inputClass} />
          <input required type="number" placeholder={t("soil.ratePerBighaRupees")} value={ratePerBigha} onChange={(e) => setRatePerBigha(e.target.value)} className={inputClass} />

          <input type="number" placeholder={t("soil.advanceAmountRupees")} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className={cn(inputClass, "col-span-2")} />

          {advanceAmount && (
            <div className="col-span-2 flex flex-col gap-2">
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
                <option value="CASH">{t("dispatch.paymentCash")}</option>
                <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                <option value="UPI">{t("dispatch.paymentUpi")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
              {paymentMode === "CASH_AND_ONLINE" && (
                <PaymentSplitFields
                  totalAmount={Number(advanceAmount) || 0}
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

          <Button type="submit" disabled={loading} className="col-span-2">
            {t("soil.saveContract")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
