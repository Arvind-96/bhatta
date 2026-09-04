import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import type { LedgerCategory, LedgerEntry, LedgerPaymentMode } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { cn } from "@/lib/utils";

interface EditLedgerEntryModalProps {
  entry: LedgerEntry;
  onClose: () => void;
}

const inputClass =
  "h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  WAGE: "Wage",
  COMMISSION: "Commission",
  SALARY: "Salary",
  TIP: "Tip",
  ADVANCE: "Advance",
  KHARCHI: "Kharchi",
  MEDICAL: "Medical",
  FESTIVAL: "Festival",
  SALE: "Sale",
  SOIL: "Soil",
  SAND: "Sand",
  FUEL: "Fuel",
  FARE: "Fare (Bhada)",
  OTHER: "Other",
};

// The one place every Advance/Kharchi/Medical/Festival/Bill ledger row can
// be corrected or removed after the fact — opened from a row's Edit button
// wherever ledger history is rendered (LedgerModal, LedgerCategoryHistory-
// Sections, LandownerDetailPage's payment history). Directly mutates/deletes
// the entry itself (per the admin's explicit choice) rather than posting a
// correction entry, so a typo'd amount can just be fixed in place.
export function EditLedgerEntryModal({ entry, onClose }: EditLedgerEntryModalProps) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<"DUE" | "PAID">(entry.direction);
  const [amount, setAmount] = useState(String(entry.amount));
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>(entry.paymentMode ?? "CASH");
  const [cashAmount, setCashAmount] = useState(entry.cashAmount != null ? String(entry.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(entry.onlineAmount != null ? String(entry.onlineAmount) : "");
  const [category, setCategory] = useState<LedgerCategory | "">(entry.category ?? "");
  const [reason, setReason] = useState(entry.reason);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const usingSplit = direction === "PAID" && paymentMode === "CASH_AND_ONLINE";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError(t("people.enterAmountGreaterThanZero"));
      return;
    }
    if (!reason.trim()) {
      setError(t("people.enterReasonForEntry"));
      return;
    }
    if (usingSplit && isPaymentSplitMismatched(paymentMode, Number(amount), cashAmount, onlineAmount)) {
      setError(t("payment.splitMismatch", { total: Number(amount).toLocaleString("en-IN") }));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.ledger.update(entry._id, {
        direction,
        amount: Number(amount),
        reason: reason.trim(),
        date,
        paymentMode: direction === "PAID" ? paymentMode : undefined,
        cashAmount: usingSplit ? Number(cashAmount) : undefined,
        onlineAmount: usingSplit ? Number(onlineAmount) : undefined,
        category: category || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("people.confirmDeleteLedgerEntry"))) return;
    setError("");
    setDeleting(true);
    try {
      await api.ledger.remove(entry._id);
      onClose();
    } catch (err) {
      // Bug fix: this destructive, irreversible action had no catch at
      // all — weaker error handling than the edit submit right above it,
      // which does catch correctly.
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setDeleting(false);
    }
  }

  // Portalled to <body> for the same reason as LedgerModal/QuickLedgerModal
  // — a `position: fixed` descendant gets trapped by an ancestor Card's
  // hover transform otherwise.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("people.editLedgerEntry")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div className="flex gap-2">
            <select value={direction} onChange={(e) => setDirection(e.target.value as "DUE" | "PAID")} className={cn(inputClass, "flex-1")}>
              <option value="DUE">{t("people.directionDue")}</option>
              <option value="PAID">{t("people.directionPaid")}</option>
            </select>
            {direction === "PAID" && (
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)} className={cn(inputClass, "flex-1")}>
                <option value="CASH">{t("people.cash")}</option>
                <option value="BANK">{t("people.bank")}</option>
                <option value="UPI">{t("people.upi")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              placeholder={t("people.amountRupees")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(inputClass, "flex-1")}
            />
            <DateInput
              required
              aria-label={t("common.transactionDate")}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn(inputClass, "w-[9.5rem] shrink-0")}
            />
          </div>
          {usingSplit && (
            <PaymentSplitFields
              totalAmount={Number(amount) || 0}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={inputClass}
            />
          )}
          <select value={category} onChange={(e) => setCategory((e.target.value || "") as LedgerCategory | "")} className={inputClass}>
            <option value="">{t("people.categoryOptional")}</option>
            {(Object.keys(CATEGORY_LABELS) as LedgerCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input placeholder={t("people.reason")} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          {error && <p className="text-xs font-medium text-status-critical">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-status-critical/30 bg-status-critical/5 px-3.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? t("common.saving") : t("common.saveChanges")}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
