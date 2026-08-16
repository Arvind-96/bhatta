import { useTranslation } from "@/hooks/useTranslation";

// Pure (no i18n dependency, callable from a submit handler) — true when the
// two split amounts don't add up to the total. Callers MUST check this
// before submitting when paymentMode is CASH_AND_ONLINE; the server also
// rejects a mismatch, but failing fast client-side avoids a round trip and
// a confusing "nothing happened" submit.
export function isPaymentSplitMismatched(
  paymentMode: string | undefined,
  totalAmount: number,
  cashAmount: string,
  onlineAmount: string
): boolean {
  if (paymentMode !== "CASH_AND_ONLINE") return false;
  const sum = (Number(cashAmount) || 0) + (Number(onlineAmount) || 0);
  return Math.round(sum * 100) !== Math.round(totalAmount * 100);
}

// Shown whenever a payment-mode select's value is CASH_AND_ONLINE — two
// amount inputs that must sum to the entry's total (some customers pay
// part online, part cash). Used by every form that accepts a payment mode:
// Dispatch, ledger entries, payment receipts.
export function PaymentSplitFields({
  totalAmount,
  cashAmount,
  onlineAmount,
  onCashAmountChange,
  onOnlineAmountChange,
  inputClassName,
}: {
  totalAmount: number;
  cashAmount: string;
  onlineAmount: string;
  onCashAmountChange: (value: string) => void;
  onOnlineAmountChange: (value: string) => void;
  inputClassName: string;
}) {
  const { t } = useTranslation();
  const mismatch = totalAmount > 0 && !!(cashAmount || onlineAmount) && isPaymentSplitMismatched("CASH_AND_ONLINE", totalAmount, cashAmount, onlineAmount);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder={t("payment.cashAmount")}
          value={cashAmount}
          onChange={(e) => onCashAmountChange(e.target.value)}
          className={inputClassName}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder={t("payment.onlineAmount")}
          value={onlineAmount}
          onChange={(e) => onOnlineAmountChange(e.target.value)}
          className={inputClassName}
        />
      </div>
      {mismatch ? (
        <p className="text-sm text-status-critical">
          {t("payment.splitMismatch", { total: totalAmount.toLocaleString("en-IN") })}
        </p>
      ) : null}
    </div>
  );
}
