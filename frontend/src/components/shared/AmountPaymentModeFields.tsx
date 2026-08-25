import { useTranslation } from "@/hooks/useTranslation";
import { PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { LaborPaymentMode } from "@/types";

// Dynamically appears below an amount field (Driver Reward, Loading
// Charge, Unloading Charge, ...) the moment that amount is > 0 — the
// caller decides visibility (`amount > 0`), this just renders the Cash /
// Online / Cash + Online picker and, when CASH_AND_ONLINE is chosen, the
// same split inputs used everywhere else in this app (see
// PaymentSplitFields). Deliberately a simpler 3-way choice than the
// dispatch/invoice-level payment mode (no Bank/UPI/GST_INVOICE
// distinction) — this is for the smaller, informal labor-style costs the
// admin usually just pays as cash or a UPI/bank transfer either way.
export function AmountPaymentModeFields({
  amount,
  paymentMode,
  cashAmount,
  onlineAmount,
  onPaymentModeChange,
  onCashAmountChange,
  onOnlineAmountChange,
  inputClassName,
}: {
  amount: number;
  paymentMode: LaborPaymentMode | "";
  cashAmount: string;
  onlineAmount: string;
  onPaymentModeChange: (mode: LaborPaymentMode) => void;
  onCashAmountChange: (value: string) => void;
  onOnlineAmountChange: (value: string) => void;
  inputClassName: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="col-span-full flex flex-col gap-1.5 rounded-xl border border-border bg-ink-primary/5 p-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{t("common.howWasThisPaid")}</span>
        <select value={paymentMode} onChange={(e) => onPaymentModeChange(e.target.value as LaborPaymentMode)} className={inputClassName}>
          <option value="">{t("common.select")}</option>
          <option value="CASH">{t("dispatch.paymentCash")}</option>
          <option value="ONLINE">{t("common.paymentOnline")}</option>
          <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
        </select>
      </label>
      {paymentMode === "CASH_AND_ONLINE" && (
        <PaymentSplitFields
          totalAmount={amount}
          cashAmount={cashAmount}
          onlineAmount={onlineAmount}
          onCashAmountChange={onCashAmountChange}
          onOnlineAmountChange={onOnlineAmountChange}
          inputClassName={inputClassName}
        />
      )}
    </div>
  );
}
