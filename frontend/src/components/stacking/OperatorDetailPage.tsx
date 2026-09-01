import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { EditStackingEntryModal } from "./EditStackingEntryModal";
import type { LedgerEntry, Person, StackingEntry, StackingStage } from "@/types";
import { formatINR } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersonTypeMeta } from "@/components/people/personTypes";

function useStageLabels(): Record<StackingStage, string> {
  const { t } = useTranslation();
  return {
    PHAD_TO_STOCK: t("stacking.stage1Label"),
    STOCK_TO_CHAMBER: t("stacking.stage2Label"),
  };
}

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface OperatorDetailPageProps {
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

// The bharai operator's profile — a buggi/tractor gang head (Labour
// Contractor, Worker, or Helper acting as jamadaar). Editable default rate,
// earnings vs. advance breakdown, and their full stacking work history with
// full admin edit on every entry.
export function OperatorDetailPage({ operatorId, onBack }: OperatorDetailPageProps) {
  const { t } = useTranslation();
  const stageLabels = useStageLabels();
  const personTypeMeta = usePersonTypeMeta();
  const [operator, setOperator] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [workHistory, setWorkHistory] = useState<StackingEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [stageInput, setStageInput] = useState<"" | StackingStage>("");
  const [savingRate, setSavingRate] = useState(false);
  const [editingEntry, setEditingEntry] = useState<StackingEntry | null>(null);

  async function refresh() {
    const [detail, ledger, history] = await Promise.all([
      api.people.get(operatorId),
      api.people.listLedger(operatorId),
      api.stacking.list({ gangId: operatorId }),
    ]);
    setOperator(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setWorkHistory(history);
    setSalaryInput(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
    setStageInput(detail.person.stackingStage ?? "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [operatorId]);

  useKilnEvent("stacking:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    setSavingRate(true);
    try {
      await api.people.update(operatorId, {
        monthlySalary: salaryInput ? Number(salaryInput) : undefined,
        stackingStage: stageInput || undefined,
      });
      await refresh();
    } finally {
      setSavingRate(false);
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("stacking.backToBharai")}
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
  const totalDamaged = workHistory.reduce((sum, e) => sum + e.damageCount, 0);

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{operator.name}</h3>
          <p className="text-sm text-ink-muted">
            {t("stacking.bharaiOperatorLabel")} ({personTypeMeta[operator.type].label})
            {operator.stackingStage ? ` · ${stageLabels[operator.stackingStage]}` : ""}
          </p>
          {totalDamaged > 0 && (
            <p className="mt-1 text-sm font-medium text-status-critical">{totalDamaged.toLocaleString("en-IN")} {t("stacking.bricksDamagedWord")}</p>
          )}
        </div>
        <LedgerQuickActions person={operator} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.operatorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={operator.phone} />
            <Field label={t("stacking.addressField")} value={operator.address} />
            <Field label={t("stacking.aadharIdField")} value={operator.idNumber} />
            <Field label={t("common.status")} value={operator.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.bharaiSalaryStage")}</h4>
          <form onSubmit={saveRate} className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-ink-muted">{t("stacking.monthlySalaryLabel")}</label>
                <input
                  type="number"
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                  placeholder={t("stacking.egSalary12000")}
                  className={inputClass}
                />
              </div>
              <Button type="submit" size="sm" disabled={savingRate}>
                {t("common.save")}
              </Button>
            </div>
            <select value={stageInput} onChange={(e) => setStageInput(e.target.value as "" | StackingStage)} className={inputClass}>
              <option value="">{t("stacking.stageNotSet")}</option>
              <option value="PHAD_TO_STOCK">{stageLabels.PHAD_TO_STOCK}</option>
              <option value="STOCK_TO_CHAMBER">{stageLabels.STOCK_TO_CHAMBER}</option>
            </select>
          </form>
          <p className="mt-2 text-sm text-ink-muted">{t("stacking.settledManuallyHint")}</p>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.dueBalanceLedger")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("stacking.totalEarningsLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("stacking.advancesKharchiExpensesLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("stacking.netDueLabel") : t("stacking.advanceOutstandingLabel")}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.stackingWorkHistory")}</h4>
          {workHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("stacking.noBharaiEntriesLoggedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("stacking.chamberColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.stageColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.modeColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.bricksColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.damagedLabel")}</th>
                    <th className="pb-2 font-medium">{t("stacking.qualityColumn")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {workHistory.map((entry) => (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">#{typeof entry.gherId === "object" ? entry.gherId.number : "—"}</td>
                      <td className="py-3 text-ink-secondary">{entry.stage ? stageLabels[entry.stage] : "—"}</td>
                      <td className="py-3 text-ink-secondary">
                        {entry.mode === "TRACTOR" ? `${t("stacking.tractorOption")} · ${entry.tractorNumber ?? "—"}` : entry.mode === "BUGGI" ? `${t("stacking.buggiOption")} × ${entry.buggiCount ?? "—"}` : "—"}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                      <td className={`py-3 tabular-nums ${entry.damageCount > 0 ? "text-status-critical" : "text-ink-muted"}`}>{entry.damageCount}</td>
                      <td className="py-3">
                        <Badge variant={entry.qualityRating === "GOOD" ? "good" : entry.qualityRating === "AVERAGE" ? "warning" : "critical"}>
                          {entry.qualityRating === "GOOD" ? t("stacking.qualityGood") : entry.qualityRating === "AVERAGE" ? t("stacking.qualityAverage") : t("stacking.qualityPoor")}
                        </Badge>
                      </td>
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
        <EditStackingEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
