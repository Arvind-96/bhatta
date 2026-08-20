import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { DepthUnit, Land, LedgerPaymentMode, SoilContractRateType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddSoilContractModalProps {
  landownerId: string;
  lands: Land[];
  onClose: () => void;
  onCreated: () => void;
}

// A contract for a landowner who was added without one (or needs a
// second/replacement contract) — same fields as EditSoilContractModal
// plus the land picker, reachable from an existing landowner's own
// profile instead of only at creation time. This is now the only way to
// add a contract once the landowner already exists, since the Soil
// page's Contracts tab is a read-only listing.
export function AddSoilContractModal({ landownerId, lands, onClose, onCreated }: AddSoilContractModalProps) {
  const { t } = useTranslation();
  const [landId, setLandId] = useState(lands[0]?._id ?? "");
  const [rateType, setRateType] = useState<SoilContractRateType>("PER_TROLLEY");
  const [contractedQuantity, setContractedQuantity] = useState("");
  const [ratePerTrolley, setRatePerTrolley] = useState("");
  const [contractedAreaBigha, setContractedAreaBigha] = useState("");
  const [ratePerBigha, setRatePerBigha] = useState("");
  const [contractedDepth, setContractedDepth] = useState("");
  const [depthUnit, setDepthUnit] = useState<DepthUnit>("feet");
  const [ratePerDepthUnit, setRatePerDepthUnit] = useState("");
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
    if (rateType === "PER_TROLLEY" && (!contractedQuantity || !ratePerTrolley)) return;
    if (rateType === "PER_BIGHA" && (!contractedAreaBigha || !ratePerBigha)) return;
    if (rateType === "PER_DEPTH" && (!contractedDepth || !ratePerDepthUnit)) return;
    if (rateType === "BOTH" && (!contractedAreaBigha || !ratePerBigha || !contractedDepth || !ratePerDepthUnit)) return;
    if (isPaymentSplitMismatched(paymentMode, Number(advanceAmount) || 0, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(advanceAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.soilContracts.create({
        landId,
        landownerId,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("soil.newContract")}</h3>
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
            {(
              [
                { value: "PER_TROLLEY", label: t("soil.perTrolley") },
                { value: "PER_BIGHA", label: t("soil.fixedPerBigha") },
                { value: "PER_DEPTH", label: t("soil.fixedPerDepth") },
                { value: "BOTH", label: t("soil.bothBighaAndDepth") },
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
            </>
          )}

          {rateType === "BOTH" && (
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
            </>
          )}

          <input
            type="number"
            placeholder={t("soil.advanceAmountRupees")}
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />

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

          {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}

          <Button type="submit" disabled={loading} className="col-span-2">
            {t("soil.saveContract")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
