import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { AddWorkEntryModal } from "@/components/people/AddWorkEntryModal";
import { EditWorkEntryModal } from "@/components/people/EditWorkEntryModal";
import type { LedgerEntry, Person, WorkEntry } from "@/types";
import { formatINR } from "@/lib/utils";
import { usePersonTypeMeta } from "@/components/people/personTypes";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface PakayiOperatorDetailPageProps {
  operatorId: string;
  onBack: () => void;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

// The Pakayi operator's profile — an independent firing-side worker (not
// mapped under any thekedar via pakayiContractorId). Mirrors
// nikasi/NikasiOperatorDetailPage.tsx: editable monthly salary, earnings
// vs. advance breakdown, and full production history with admin edit on
// every entry, built on the shared work_entries table.
export function PakayiOperatorDetailPage({ operatorId, onBack }: PakayiOperatorDetailPageProps) {
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const [operator, setOperator] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkEntry | null>(null);

  async function refresh() {
    const [detail, ledger, history] = await Promise.all([
      api.people.get(operatorId),
      api.people.listLedger(operatorId),
      api.workEntries.list({ personId: operatorId, workType: "PAKAYI" }),
    ]);
    setOperator(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setWorkHistory(history);
    setSalaryInput(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [operatorId]);

  useKilnEvent("workEntry:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveSalary(e: FormEvent) {
    e.preventDefault();
    setSavingSalary(true);
    try {
      await api.people.update(operatorId, { monthlySalary: salaryInput ? Number(salaryInput) : undefined });
      await refresh();
    } finally {
      setSavingSalary(false);
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("firing.backToFiring")}
    </button>
  );

  if (!operator) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const totalEarnings = ledgerEntries
    .filter((e) => e.direction === "DUE" && (e.category === "WAGE" || e.category === "SALARY" || !e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const advancesByCategory = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.direction !== "PAID") continue;
    const key = e.category ?? "OTHER";
    advancesByCategory.set(key, (advancesByCategory.get(key) ?? 0) + e.amount);
  }
  const totalAdvancesGiven = Array.from(advancesByCategory.values()).reduce((sum, v) => sum + v, 0);
  const totalQuantity = workHistory.reduce((sum, e) => sum + e.quantity, 0);

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{operator.name}</h3>
          <p className="text-sm text-ink-muted">{t("firing.operatorRoleLabel", { type: personTypeMeta[operator.type].label })}</p>
        </div>
        <LedgerQuickActions person={operator} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.operatorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={operator.phone} />
            <Field label={t("firing.address")} value={operator.address} />
            <Field label={t("firing.aadharId")} value={operator.idNumber} />
            <Field label={t("common.status")} value={operator.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.monthlySalary")}</h4>
          <form onSubmit={saveSalary} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("firing.monthlySalaryLabel")}</label>
              <input
                type="number"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder={t("firing.eg10000")}
                className={inputClass}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingSalary}>
              {t("common.save")}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.dueBalanceLedger")}</h4>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalQuantity.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("firing.quantityLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("firing.totalEarnings")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("firing.advancesKharchiExpenses")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("firing.netDue") : t("firing.advanceOutstandingLabel")}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.productionHistory")}</h4>
            <Button size="sm" onClick={() => setShowAddEntry(true)}>
              <Plus className="h-4 w-4" /> {t("firing.logEntry")}
            </Button>
          </div>
          {workHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("firing.noEntriesLoggedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("firing.quantityLabel")}</th>
                    <th className="pb-2 font-medium">{t("common.notes")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {workHistory.map((entry) => (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.quantity.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">{entry.notes ?? "—"}</td>
                      <td className="py-3 text-right">
                        <button onClick={() => setEditingEntry(entry)} className="text-xs font-medium text-series-1 hover:underline">
                          {t("common.edit")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <LedgerCategoryHistorySections entries={ledgerEntries} />
      </div>

      {showAddEntry && (
        <AddWorkEntryModal personId={operatorId} defaultWorkType="PAKAYI" onClose={() => setShowAddEntry(false)} onCreated={refresh} />
      )}
      {editingEntry && <EditWorkEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />}
    </div>
  );
}
