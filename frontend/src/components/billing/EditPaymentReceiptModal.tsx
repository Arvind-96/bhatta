import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { LedgerPaymentMode, PaymentReceipt } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditPaymentReceiptModalProps {
  receipt: PaymentReceipt;
  personName: string;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — a changed amountPaid never silently rewrites the PAID
// entry already posted when the receipt was first issued; the backend
// posts a correction entry for the difference instead (see
// paymentReceipt.service.ts), same convention as every other editable
// money entry in this app (work entries, soil arrivals, ...).
export function EditPaymentReceiptModal({ receipt, personName, onClose, onSaved }: EditPaymentReceiptModalProps) {
  const { t } = useTranslation();
  const [amountPaid, setAmountPaid] = useState(String(receipt.amountPaid));
  const [totalAgreedAmount, setTotalAgreedAmount] = useState(receipt.totalAgreedAmount != null ? String(receipt.totalAgreedAmount) : "");
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode | "">(receipt.paymentMode ?? "");
  const [cashAmount, setCashAmount] = useState(receipt.cashAmount != null ? String(receipt.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(receipt.onlineAmount != null ? String(receipt.onlineAmount) : "");
  const [date, setDate] = useState(receipt.date.slice(0, 10));
  const [notes, setNotes] = useState(receipt.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amountPaid) return;
    const usingSplit = paymentMode === "CASH_AND_ONLINE";
    if (usingSplit && isPaymentSplitMismatched(paymentMode, Number(amountPaid), cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: Number(amountPaid).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.paymentReceipts.update(receipt._id, {
        amountPaid: Number(amountPaid),
        totalAgreedAmount: totalAgreedAmount ? Number(totalAgreedAmount) : undefined,
        paymentMode: paymentMode || undefined,
        cashAmount: usingSplit ? Number(cashAmount) : undefined,
        onlineAmount: usingSplit ? Number(onlineAmount) : undefined,
        notes: notes || undefined,
        date,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">{t("billing.editPaymentReceipt")}</h3>
            <p className="text-sm text-ink-muted">
              {t("billing.receiptNumberLabel")} {receipt.receiptNumber} · {personName}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            required
            type="number"
            placeholder={t("billing.amountPayingNowPlaceholder")}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            className={cn(inputClass, "w-full")}
          />
          <input
            type="number"
            placeholder={t("billing.totalAgreedAmountPlaceholder")}
            value={totalAgreedAmount}
            onChange={(e) => setTotalAgreedAmount(e.target.value)}
            className={cn(inputClass, "w-full")}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode | "")}
              className={inputClass}
            >
              <option value="">{t("billing.paymentModeOptional")}</option>
              <option value="CASH">{t("billing.paymentCash")}</option>
              <option value="BANK">{t("billing.paymentBank")}</option>
              <option value="UPI">{t("billing.paymentUpi")}</option>
              <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
            </select>
            <DateInput
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          {paymentMode === "CASH_AND_ONLINE" && (
            <PaymentSplitFields
              totalAmount={Number(amountPaid) || 0}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={cn(inputClass, "w-full")}
            />
          )}
          <input
            placeholder={t("common.notesOptional")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputClass, "w-full")}
          />
          {formError && <p className="text-sm text-status-critical">{formError}</p>}

          <Button type="submit" disabled={saving} className="w-full">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
