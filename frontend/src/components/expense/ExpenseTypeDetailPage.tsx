import { useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { ExpenseDetailPage } from "./ExpenseDetailPage";
import type { Expense, ExpenseType, ExpenseTypeDetail } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface ExpenseTypeDetailPageProps {
  expenseTypeId: string;
  expenseTypes: ExpenseType[];
  onBack: () => void;
}

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// The profile-style page for a single Expense Type — items 3/5 of the
// request: Total Paid/Total Due at the top (never stored, always
// recomputed live — see expenseType.service.ts's getExpenseTypeDetail),
// then every expense logged under it grouped date-wise into month
// sections, newest month first. Search matches the raw transaction-date
// string so typing a day, month name, or year all work the same way.
export function ExpenseTypeDetailPage({ expenseTypeId, expenseTypes, onBack }: ExpenseTypeDetailPageProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ExpenseTypeDetail | null>(null);
  const [search, setSearch] = useState("");
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null);

  async function refresh() {
    setDetail(await api.expenseTypes.detail(expenseTypeId));
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseTypeId]);

  useKilnEvent("expense:update", () => refresh());
  useKilnEvent("expenseType:update", () => refresh());

  const openExpense = detail?.expenses.find((e) => e._id === openExpenseId) ?? null;
  if (openExpense && detail) {
    return (
      <ExpenseDetailPage
        expense={openExpense}
        expenseType={detail.expenseType}
        expenseTypes={expenseTypes}
        dueAfter={detail.totalDue}
        onBack={() => setOpenExpenseId(null)}
        onDeleted={() => {
          setOpenExpenseId(null);
          refresh();
        }}
        onSaved={() => {
          setOpenExpenseId(null);
          refresh();
        }}
      />
    );
  }

  if (!detail) {
    return (
      <div>
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft className="h-4 w-4" /> {t("expense.backToExpenseTypes")}
        </button>
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const { expenseType, expenses, totalPaid, totalDue } = detail;
  const filtered = search.trim()
    ? expenses.filter((e) => new Date(e.date).toLocaleDateString("en-IN").includes(search.trim()) || monthKey(e.date).toLowerCase().includes(search.trim().toLowerCase()))
    : expenses;

  const sections = new Map<string, Expense[]>();
  for (const e of filtered) {
    const key = monthKey(e.date);
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(e);
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("expense.backToExpenseTypes")}
      </button>

      <Card className="mb-4">
        <h3 className="mb-3 text-lg font-semibold text-ink-primary">{expenseType.name}</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-center">
            <p className="text-xs text-ink-muted">{t("customer.totalPaidLabel")}</p>
            <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(totalPaid)}</p>
          </div>
          <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-center">
            <p className="text-xs text-ink-muted">{t("customer.totalDueLabel")}</p>
            <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(Math.abs(totalDue))}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            placeholder={t("expense.searchExpensesPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(inputClass, "w-full max-w-sm pl-9")}
          />
        </div>

        {expenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("expense.noExpensesYet")}</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("expense.noExpensesMatchSearch")}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {Array.from(sections.entries()).map(([month, rows]) => (
              <div key={month}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{month}</p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-ink-primary/5 text-left text-sm text-ink-muted">
                        <th className="px-3 py-2 font-medium">{t("expense.transactionDateLabel")}</th>
                        <th className="px-3 py-2 font-medium">{t("common.amount")}</th>
                        <th className="px-3 py-2 font-medium">{t("common.notes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr
                          key={e._id}
                          onClick={() => setOpenExpenseId(e._id)}
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                        >
                          <td className="px-3 py-2 text-ink-primary">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                          <td className="px-3 py-2 tabular-nums text-ink-secondary">₹{formatINR(e.amount)}</td>
                          <td className="px-3 py-2 text-ink-secondary">{e.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
