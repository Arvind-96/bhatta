import { FormEvent, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import type { Expense, ExpenseType, LaborPaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddExpenseFormProps {
  expenseTypes: ExpenseType[];
  existing?: Expense | null;
  existingTypeName?: string;
  onSaved: () => void;
  onCancel?: () => void;
}

// Handles both logging a brand-new expense (item 2 of the request) and
// editing an existing one (item 4) — the same dual-mode pattern used by
// AddCustomerForm. Total Paid/Total Due (f/g) are never editable inputs;
// they're a live preview fetched from the selected expense type's current
// balance (see expenseType.service.ts's getExpenseTypeDetail) and recomputed
// on every Amount Paying keystroke, left blank for a genuinely new type.
export function AddExpenseForm({ expenseTypes, existing, existingTypeName, onSaved, onCancel }: AddExpenseFormProps) {
  const { t } = useTranslation();
  const existingType = existing ? expenseTypes.find((tp) => tp._id === existing.expenseTypeId) : undefined;

  const [selectedTypeId, setSelectedTypeId] = useState(existing?.expenseTypeId ?? "");
  const [newTypeName, setNewTypeName] = useState("");
  const [transactionDate, setTransactionDate] = useState((existing?.date ?? new Date().toISOString()).slice(0, 10));
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [paymentMode, setPaymentMode] = useState<LaborPaymentMode | "">(existing?.paymentMode ?? "");
  const [cashAmount, setCashAmount] = useState(existing?.cashAmount != null ? String(existing.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(existing?.onlineAmount != null ? String(existing.onlineAmount) : "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [balance, setBalance] = useState<{ totalPaid: number; totalDue: number } | null>(null);

  const isEditing = !!existing;
  const resolvedTypeName = existing ? existingTypeName ?? existingType?.name ?? "" : newTypeName.trim() || expenseTypes.find((tp) => tp._id === selectedTypeId)?.name || "";
  const isGasCylinder = resolvedTypeName.trim().toLowerCase() === "gas cylinder";

  // Balance shown is the type's balance BEFORE this entry — fetched fresh
  // whenever the selected type changes, never for a freshly-typed new type
  // (there's no history to fetch) or while editing (editing an old entry's
  // amount doesn't cleanly "add on top of" the current total the same way).
  useEffect(() => {
    if (isEditing || !selectedTypeId || newTypeName.trim()) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    api.expenseTypes
      .detail(selectedTypeId)
      .then((d) => {
        if (!cancelled) setBalance({ totalPaid: d.totalPaid, totalDue: d.totalDue });
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId, newTypeName, isEditing]);

  const amountPaying = Number(amount) || 0;
  const previewPaid = balance ? balance.totalPaid + amountPaying : undefined;
  const previewDue = balance ? balance.totalDue - amountPaying : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resolvedTypeName || !amount) return;
    if (isPaymentSplitMismatched(paymentMode, Number(amount) || 0, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(amount) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const paymentInfo = {
        paymentMode: paymentMode || undefined,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
      };
      if (isEditing) {
        await api.expenses.update(existing._id, {
          amount: Number(amount),
          quantity: isGasCylinder && quantity ? Number(quantity) : undefined,
          date: transactionDate || undefined,
          notes: notes || undefined,
          ...paymentInfo,
        });
      } else {
        await api.expenses.create({
          expenseTypeName: resolvedTypeName,
          amount: Number(amount),
          quantity: isGasCylinder && quantity ? Number(quantity) : undefined,
          date: transactionDate || undefined,
          notes: notes || undefined,
          ...paymentInfo,
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-ink-primary">{isEditing ? t("expense.editExpenseTitle") : t("expense.addExpenseTitle")}</p>

        {!isEditing && (
          <>
            <SearchableSelect
              options={expenseTypes.map((tp) => ({ value: tp._id, label: tp.name }))}
              value={selectedTypeId}
              onChange={(v) => {
                setSelectedTypeId(v);
                if (v) setNewTypeName("");
              }}
              placeholder={t("expense.expenseTypePlaceholder")}
              required={!newTypeName.trim()}
            />
            <div>
              <input
                placeholder={t("expense.addExpenseTypePlaceholder")}
                value={newTypeName}
                onChange={(e) => {
                  setNewTypeName(e.target.value);
                  if (e.target.value) setSelectedTypeId("");
                }}
                className={`${inputClass} w-full`}
              />
              <p className="mt-1 text-xs text-ink-muted">{t("expense.addExpenseTypeHint")}</p>
            </div>
          </>
        )}
        {isEditing && <p className="text-sm font-medium text-ink-secondary">{resolvedTypeName}</p>}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("expense.transactionDateLabel")}</span>
            <DateInput value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className={inputClass} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("expense.systemEntryDateLabel")}</span>
            <DateInput value={(existing?.createdAt ?? new Date().toISOString()).slice(0, 10)} disabled className={`${inputClass} opacity-60`} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-ink-muted">{t("expense.systemEntryDateHint")}</p>

        <div className="grid grid-cols-2 gap-2">
          <input
            required
            type="number"
            step="0.01"
            placeholder={t("expense.amountPayingPlaceholder")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
          {isGasCylinder && (
            <input
              type="number"
              placeholder={t("expense.quantityPlaceholder")}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
          )}
        </div>

        {Number(amount) > 0 && (
          <AmountPaymentModeFields
            amount={Number(amount)}
            paymentMode={paymentMode}
            cashAmount={cashAmount}
            onlineAmount={onlineAmount}
            onPaymentModeChange={setPaymentMode}
            onCashAmountChange={setCashAmount}
            onOnlineAmountChange={setOnlineAmount}
            inputClassName={inputClass}
          />
        )}

        {!isEditing && (newTypeName.trim() ? (
          <p className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-center text-xs text-ink-muted">
            {t("expense.newExpenseTypeBalanceHint")}
          </p>
        ) : balance ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-center">
              <p className="text-xs text-ink-muted">{t("customer.totalPaidLabel")}</p>
              <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(previewPaid ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-center">
              <p className="text-xs text-ink-muted">{t("customer.totalDueLabel")}</p>
              <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(Math.max(0, previewDue ?? 0))}</p>
            </div>
          </div>
        ) : null)}

        <input
          placeholder={t("expense.notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputClass} w-full`}
        />

        {formError && <p className="text-sm text-status-critical">{formError}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {t("expense.saveExpense")}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
