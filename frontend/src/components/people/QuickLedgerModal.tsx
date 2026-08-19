import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import type { LedgerCategory, LedgerPaymentMode, Person } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";

export type QuickLedgerCategory = "ADVANCE" | "KHARCHI" | "MEDICAL" | "FESTIVAL";

interface QuickLedgerModalProps {
  person: Person;
  category: QuickLedgerCategory;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  "h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const CATEGORY_META: Record<
  QuickLedgerCategory,
  { titleKey: string; defaultReasonKey: (isContractor: boolean) => string }
> = {
  ADVANCE: {
    titleKey: "people.advancePeshgiTitle",
    defaultReasonKey: (isContractor) => (isContractor ? "people.reasonAdvanceToThekedar" : "people.reasonAdvancePeshgi"),
  },
  KHARCHI: {
    titleKey: "people.kharchiFull",
    defaultReasonKey: (isContractor) => (isContractor ? "people.reasonKharchiGivenToThekedar" : "people.reasonKharchiDailyAllowance"),
  },
  MEDICAL: {
    titleKey: "people.medical",
    defaultReasonKey: () => "people.reasonMedicalInjuryAdvance",
  },
  FESTIVAL: {
    titleKey: "people.festivalTyohar",
    defaultReasonKey: () => "people.reasonTyoharFestivalAdvance",
  },
};

// One dedicated quick-entry flow per top-level CTA (Advance/Kharchi/Medical/
// Festival) — category and direction (always PAID, money handed to the
// person) are fixed by which button opened it, so all that's left to ask is
// amount/mode/reason. Replaces the old single "Advance / Kharchi" button
// that opened the full generic LedgerModal on contractor/labor profiles.
export function QuickLedgerModal({ person, category, onClose, onSaved }: QuickLedgerModalProps) {
  const { t } = useTranslation();
  const isContractor = person.type === "LABOUR_CONTRACTOR";
  const meta = CATEGORY_META[category];
  const title = t(meta.titleKey);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [reason, setReason] = useState(t(meta.defaultReasonKey(isContractor)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError(t("people.enterAmountGreaterThanZero"));
      return;
    }
    if (isPaymentSplitMismatched(paymentMode, Number(amount), cashAmount, onlineAmount)) {
      setError(t("payment.splitMismatch", { total: Number(amount).toLocaleString("en-IN") }));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.people.addLedger(person._id, {
        direction: "PAID",
        amount: Number(amount),
        reason: reason.trim() || title,
        date: date || undefined,
        paymentMode,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        category: category as LedgerCategory,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("people.failedToAddEntry"));
    } finally {
      setLoading(false);
    }
  }

  // Portalled straight to <body> — this modal is opened from buttons that
  // live inside a profile header Card, and that Card lifts on hover
  // (hover:-translate-y-0.5). A CSS `transform` on any ancestor turns it
  // into the containing block for `position: fixed` descendants, so
  // without the portal this modal would render pinned to that Card's own
  // box instead of the viewport whenever the cursor was still over the
  // card that was just clicked — exactly the clipped/misplaced popup this
  // fixes. See QuickLedgerModal usage from LedgerQuickActions.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
            <p className="text-sm text-ink-muted">{person.name}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <input
            autoFocus
            type="number"
            min={0}
            placeholder={t("people.amountRupees")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("common.transactionDate")}</span>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
            <option value="CASH">{t("people.cash")}</option>
            <option value="BANK">{t("people.bank")}</option>
            <option value="UPI">{t("people.upi")}</option>
            <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
          </select>
          {paymentMode === "CASH_AND_ONLINE" && (
            <PaymentSplitFields
              totalAmount={Number(amount) || 0}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={inputClass}
            />
          )}
          <input placeholder={t("people.reason")} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          {error && <p className="text-xs font-medium text-status-critical">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("people.adding") : t("people.addWithTitle", { title })}
          </Button>
        </form>
      </Card>
    </div>,
    document.body
  );
}
