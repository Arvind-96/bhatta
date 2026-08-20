import { useState } from "react";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/auth.store";
import { formatINR } from "@/lib/utils";
import { printExpenseRecord } from "@/lib/printDocument";
import { AddExpenseForm } from "./AddExpenseForm";
import type { Expense, ExpenseType } from "@/types";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

interface ExpenseDetailPageProps {
  expense: Expense;
  expenseType: ExpenseType;
  expenseTypes: ExpenseType[];
  dueAfter?: number;
  onBack: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}

// The profile-style page for a single expense record (item 4 of the
// request — edit/delete/print) — reused inline from both the type detail
// page (clicking a row) and could be reused from anywhere else an expense
// is linked, mirroring InvoiceDetailPage's role for invoices.
export function ExpenseDetailPage({ expense, expenseType, expenseTypes, dueAfter, onBack, onDeleted, onSaved }: ExpenseDetailPageProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!confirm(t("expense.confirmDeleteExpense", { amount: formatINR(expense.amount) }))) return;
    await api.expenses.remove(expense._id);
    onDeleted();
  }

  function handlePrint() {
    printExpenseRecord(expense, expenseType.name, kilnInfo, dueAfter);
  }

  if (editing) {
    return (
      <AddExpenseForm
        expenseTypes={expenseTypes}
        existing={expense}
        existingTypeName={expenseType.name}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("expense.backToExpense")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">{expenseType.name}</h3>
            <p className="text-sm text-ink-muted">{new Date(expense.date).toLocaleDateString("en-IN")}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Printer className="h-3.5 w-3.5" /> {t("expense.printExpense")}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t("expense.amountPayingPlaceholder")} value={`₹${formatINR(expense.amount)}`} />
          <Field label={t("expense.quantityLabel")} value={expense.quantity} />
          <Field label={t("expense.transactionDateLabel")} value={new Date(expense.date).toLocaleDateString("en-IN")} />
          <Field label={t("expense.systemEntryDateLabel")} value={new Date(expense.createdAt).toLocaleString("en-IN")} />
        </div>
        {expense.notes && (
          <div className="mt-4">
            <p className="text-sm text-ink-muted">{t("common.notes")}</p>
            <p className="text-sm text-ink-primary">{expense.notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
