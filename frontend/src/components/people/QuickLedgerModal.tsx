import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { LedgerCategory, LedgerPaymentMode, Person } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

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
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>("CASH");
  const [reason, setReason] = useState(t(meta.defaultReasonKey(isContractor)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError(t("people.enterAmountGreaterThanZero"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.people.addLedger(person._id, {
        direction: "PAID",
        amount: Number(amount),
        reason: reason.trim() || title,
        paymentMode,
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

  return (
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
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
            <option value="CASH">{t("people.cash")}</option>
            <option value="BANK">{t("people.bank")}</option>
            <option value="UPI">{t("people.upi")}</option>
          </select>
          <input placeholder={t("people.reason")} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          {error && <p className="text-xs font-medium text-status-critical">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("people.adding") : t("people.addWithTitle", { title })}
          </Button>
        </form>
      </Card>
    </div>
  );
}
