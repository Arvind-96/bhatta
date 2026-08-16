import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { EditNikasiEntryModal } from "./EditNikasiEntryModal";
import type { LedgerEntry, NikasiEntry, Person } from "@/types";
import { formatINR } from "@/lib/utils";
import { usePersonTypeMeta } from "@/components/people/personTypes";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface NikasiOperatorDetailPageProps {
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

// The nikasi operator's profile — an independent unloading gang head
// (Labour Contractor, Worker, or Helper), not mapped under any thekedar.
// Editable monthly salary, earnings vs. advance breakdown, and their full
// unloading work history with full admin edit on every entry.
export function NikasiOperatorDetailPage({ operatorId, onBack }: NikasiOperatorDetailPageProps) {
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const [operator, setOperator] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [workHistory, setWorkHistory] = useState<NikasiEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [editingEntry, setEditingEntry] = useState<NikasiEntry | null>(null);

  async function refresh() {
    const [detail, ledger, history] = await Promise.all([
      api.people.get(operatorId),
      api.people.listLedger(operatorId),
      api.nikasi.list({ gangId: operatorId }),
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

  useKilnEvent("nikasi:update", () => refresh());
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
      <ArrowLeft className="h-4 w-4" /> {t("nikasi.backToNikasi")}
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
  const totalBricksUnloaded = workHistory.reduce((sum, e) => sum + e.bricksCount, 0);
  const totalDamaged = workHistory.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{operator.name}</h3>
          <p className="text-sm text-ink-muted">{t("nikasi.operatorRoleLabel", { type: personTypeMeta[operator.type].label })}</p>
          {totalDamaged > 0 && (
            <p className="mt-1 text-sm font-medium text-status-critical">{t("nikasi.bricksDamaged", { count: totalDamaged.toLocaleString("en-IN") })}</p>
          )}
        </div>
        <LedgerQuickActions person={operator} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.operatorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={operator.phone} />
            <Field label={t("nikasi.address")} value={operator.address} />
            <Field label={t("nikasi.aadharId")} value={operator.idNumber} />
            <Field label={t("common.status")} value={operator.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.monthlySalary")}</h4>
          <form onSubmit={saveSalary} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("nikasi.monthlySalaryLabel")}</label>
              <input
                type="number"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder={t("nikasi.eg10000")}
                className={inputClass}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingSalary}>
              {t("common.save")}
            </Button>
          </form>
          <p className="mt-2 text-sm text-ink-muted">{t("nikasi.salarySettledNote")}</p>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.dueBalanceLedger")}</h4>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalBricksUnloaded.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("nikasi.bricksUnloadedLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${totalDamaged > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                {totalDamaged.toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-ink-muted">{t("nikasi.damagedLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("nikasi.totalEarnings")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("nikasi.advancesKharchiExpenses")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("nikasi.netDue") : t("nikasi.advanceOutstanding")}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.unloadingWorkHistory")}</h4>
          {workHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("nikasi.noEntriesLoggedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.chamberHeader")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.bricksHeader")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.damagedHeader")}</th>
                    <th className="pb-2 font-medium">{t("common.notes")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {workHistory.map((entry) => (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">#{typeof entry.gherId === "object" ? entry.gherId.number : "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums">
                        {entry.damagedCount ? (
                          <span className="text-status-critical">{entry.damagedCount.toLocaleString("en-IN")}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
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

      {editingEntry && (
        <EditNikasiEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
