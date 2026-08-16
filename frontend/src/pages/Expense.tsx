import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { Expense as ExpenseEntry, ExpenseCategory } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function buildExpenseLabels(t: Translate): Record<ExpenseCategory, string> {
  return {
    JCB_RENTAL: t("expense.categoryJcbRental"),
    ROYALTY_CHALLAN: t("expense.categoryRoyaltyChallan"),
    TUBEWELL_DIESEL: t("expense.categoryTubewellDiesel"),
    TUBEWELL_ELECTRICITY: t("expense.categoryTubewellElectricity"),
    WATER: t("expense.categoryWater"),
    MOLD_SAND: t("expense.categoryMoldSand"),
    TARPAULIN: t("expense.categoryTarpaulin"),
    LABOR_COLONY: t("expense.categoryLaborColony"),
    LOCAL_CHANDA: t("expense.categoryLocalChanda"),
    PETTY_CASH: t("expense.categoryPettyCash"),
    MACHINERY_REPAIR: t("expense.categoryMachineryRepair"),
    DRIVER_BHATTA: t("expense.categoryDriverBhatta"),
    POLICE_CHALLAN: t("expense.categoryPoliceChallan"),
    COMMISSION_DALALI: t("expense.categoryCommissionDalali"),
    TRANSIT_TAX: t("expense.categoryTransitTax"),
    OTHER: t("expense.categoryOther"),
  };
}

function buildPettyCashReasons(t: Translate): string[] {
  return [
    t("expense.reasonChaiNashta"),
    t("expense.reasonStationery"),
    t("expense.reasonPujaFestival"),
    t("expense.reasonFirstAid"),
    t("expense.reasonLocalConveyance"),
    t("expense.reasonHardwareRepair"),
  ];
}

const HOURLY_CATEGORIES: ExpenseCategory[] = ["JCB_RENTAL", "TUBEWELL_DIESEL", "TUBEWELL_ELECTRICITY"];

function TotalsSummary() {
  const { t } = useTranslation();
  const EXPENSE_LABELS = buildExpenseLabels(t);
  const [totals, setTotals] = useState<{ category: ExpenseCategory; amount: number }[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setTotals(await api.expenses.totals());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("expense:update", () => refresh());

  const grandTotal = totals.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("expense.last30Days")}</h4>
        <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(grandTotal)}</p>
      </div>
      {totals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {totals
            .slice()
            .sort((a, b) => b.amount - a.amount)
            .map((row) => (
              <span key={row.category} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                {EXPENSE_LABELS[row.category]}: ₹{formatINR(row.amount)}
              </span>
            ))}
        </div>
      )}
    </Card>
  );
}

export function Expense() {
  const { t } = useTranslation();
  const EXPENSE_LABELS = buildExpenseLabels(t);
  const PETTY_CASH_REASONS = buildPettyCashReasons(t);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "JCB_RENTAL" as ExpenseCategory, amount: "", hours: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setExpenses(await api.expenses.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("expense:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedExpenses, total } = usePagination(expenses, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.amount) return;
    setLoading(true);
    try {
      await api.expenses.create({
        category: form.category,
        amount: Number(form.amount),
        hours: form.hours ? Number(form.hours) : undefined,
        notes: form.notes || undefined,
      });
      setForm({ category: "JCB_RENTAL", amount: "", hours: "", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <TotalsSummary />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("expense.logExpense")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              className={inputClass}
            >
              {Object.entries(EXPENSE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("expense.amountPlaceholder")}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputClass}
            />
            {HOURLY_CATEGORIES.includes(form.category) && (
              <input
                type="number"
                placeholder={t("expense.hoursRunOptional")}
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                className={inputClass}
              />
            )}
            {form.category === "PETTY_CASH" && (
              <div className="col-span-2 flex flex-wrap gap-1.5">
                {PETTY_CASH_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, notes: reason }))}
                    className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}
            <input
              placeholder={t("common.notes")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("expense.saveExpense")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {expenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("expense.noExpensesYet")}</p>
        ) : (
          <div className="space-y-1">
            {pagedExpenses.map((e) => (
              <div key={e._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="text-ink-primary">{EXPENSE_LABELS[e.category]}</p>
                  <p className="text-sm text-ink-muted">
                    {new Date(e.date).toLocaleDateString("en-IN")}
                    {e.hours ? ` · ${t("expense.hoursAtRate", { hours: e.hours, rate: Math.round(e.amount / e.hours) })}` : ""}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </p>
                </div>
                <span className="tabular-nums font-medium text-ink-primary">₹{formatINR(e.amount)}</span>
              </div>
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}
