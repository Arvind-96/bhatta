import { useEffect, useState } from "react";
import { List, Plus, Search } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AddExpenseForm } from "@/components/expense/AddExpenseForm";
import { ExpenseTypeDetailPage } from "@/components/expense/ExpenseTypeDetailPage";
import type { ExpenseType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Two modes toggled by the page's own "Add Expense"/"View All Expenses"
// buttons (item 1/2), mirroring the Customer page's mode-toggle pattern —
// View All Expenses lands on a list of expense TYPES (item 3); clicking one
// drills into ExpenseTypeDetailPage for its own Total Paid/Due + expenses.
export function Expense() {
  const [mode, setMode] = useState<"list" | "add">("list");
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [search, setSearch] = useState("");
  const [openTypeId, setOpenTypeId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setExpenseTypes(await api.expenseTypes.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("expenseType:update", () => refresh());

  const filtered = expenseTypes.filter((tp) => !search.trim() || tp.name.toLowerCase().includes(search.trim().toLowerCase()));

  if (openTypeId) {
    return <ExpenseTypeDetailPage expenseTypeId={openTypeId} expenseTypes={expenseTypes} onBack={() => setOpenTypeId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant={mode === "add" ? "primary" : "outline"} onClick={() => setMode("add")}>
          <Plus className="h-4 w-4" /> {t("expense.addExpenseButton")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <List className="h-4 w-4" /> {t("expense.viewAllExpensesButton")}
        </Button>
      </div>

      {mode === "add" ? (
        <AddExpenseForm
          expenseTypes={expenseTypes}
          onSaved={() => {
            setMode("list");
            refresh();
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("expense.expenseTypesHeading")}</CardTitle>
          </CardHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              placeholder={t("expense.searchExpenseTypesPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, "w-full max-w-sm pl-9")}
            />
          </div>
          {expenseTypes.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("expense.noExpenseTypesYet")}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((tp) => (
                <button
                  key={tp._id}
                  onClick={() => setOpenTypeId(tp._id)}
                  className="rounded-xl border border-border bg-ink-primary/5 px-4 py-3 text-left text-sm font-medium text-ink-primary hover:bg-ink-primary/10"
                >
                  {tp.name}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
