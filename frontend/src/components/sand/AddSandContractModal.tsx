import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { LedgerPaymentMode, SandContractRateType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddSandContractModalProps {
  sandContractorId: string;
  onClose: () => void;
  onCreated: () => void;
}

// A contract for a sand contractor who was added without one (or needs a
// second/replacement contract) — same fields and auto-calc as
// AddSandContractorModal's embedded Contract Details section, just
// reachable from an existing contractor's own profile instead of only at
// creation time. This is now the only way to add a contract once the
// contractor already exists, since the Sand page's Contracts tab is a
// read-only listing.
export function AddSandContractModal({ sandContractorId, onClose, onCreated }: AddSandContractModalProps) {
  const { t } = useTranslation();
  const [rateType, setRateType] = useState<SandContractRateType>("PER_TROLLEY");
  const [contractedTrolleys, setContractedTrolleys] = useState("");
  const [contractPrice, setContractPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [totalContractValue, setTotalContractValue] = useState("");
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Same auto-calc as AddSandContractorModal: trolleys × price per trolley,
  // only while both are filled in, only for PER_TROLLEY.
  useEffect(() => {
    if (rateType !== "PER_TROLLEY") return;
    const trolleys = Number(contractedTrolleys) || 0;
    const price = Number(contractPrice) || 0;
    if (trolleys && price) {
      setTotalContractValue(String(trolleys * price));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateType, contractedTrolleys, contractPrice]);

  const dueAmount = Math.max(0, (Number(totalContractValue) || 0) - (Number(advanceAmount) || 0));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!totalContractValue) return;
    if (rateType === "PER_TROLLEY" && !contractedTrolleys) {
      setFormError(t("sand.contractFieldsRequiredError"));
      return;
    }
    if (isPaymentSplitMismatched(paymentMode, Number(advanceAmount) || 0, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(advanceAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.sandContracts.create({
        sandContractorId,
        rateType,
        contractedTrolleys: rateType === "PER_TROLLEY" ? Number(contractedTrolleys) : undefined,
        contractPrice: contractPrice ? Number(contractPrice) : undefined,
        totalContractValue: Number(totalContractValue),
        advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
        paymentMode: advanceAmount ? paymentMode : undefined,
        cashAmount: advanceAmount && paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: advanceAmount && paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("sand.newContractModalTitle")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex gap-1">
            {(
              [
                { value: "PER_TROLLEY", label: t("sand.perTrolley") },
                { value: "PER_THOUSAND_BRICKS", label: t("sand.perThousandBricks") },
              ] as { value: SandContractRateType; label: string }[]
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
            <input
              required
              type="number"
              placeholder={t("sand.numberOfTrolleysContract")}
              value={contractedTrolleys}
              onChange={(e) => setContractedTrolleys(e.target.value)}
              className={inputClass}
            />
          )}
          <input
            type="number"
            placeholder={rateType === "PER_TROLLEY" ? t("sand.pricePerTrolley") : t("sand.pricePerThousandBricks")}
            value={contractPrice}
            onChange={(e) => setContractPrice(e.target.value)}
            className={cn(inputClass, rateType === "PER_THOUSAND_BRICKS" && "col-span-2")}
          />

          <input
            required
            type="number"
            placeholder={t("sand.totalContractAmount")}
            value={totalContractValue}
            onChange={(e) => setTotalContractValue(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
          <input
            type="number"
            placeholder={t("sand.advanceAmountPaid")}
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

          {totalContractValue && (
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
              <span className="text-sm font-medium text-ink-secondary">{t("sand.remainingDueAmount")}</span>
              <span className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(dueAmount)}</span>
            </div>
          )}

          {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}

          <Button type="submit" disabled={loading} className="col-span-2">
            {t("sand.saveContract")}
          </Button>
        </form>
      </Card>
    </div>,
    document.body
  );
}
