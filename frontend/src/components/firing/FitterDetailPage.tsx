import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerModal } from "@/components/people/LedgerModal";
import type { FiringShift, FitterRosterEntry, LedgerEntry, Person, ShiftType } from "@/types";
import { formatINR } from "@/lib/utils";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface FitterDetailPageProps {
  fitterId: string;
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

function useAdvanceCategoryLabels(): Record<string, string> {
  const { t } = useTranslation();
  return {
    ADVANCE: t("firing.advanceCategoryAdvance"),
    KHARCHI: t("firing.advanceCategoryKharchi"),
    MEDICAL: t("firing.advanceCategoryMedical"),
    FESTIVAL: t("firing.advanceCategoryFestival"),
    OTHER: t("firing.advanceCategoryOther"),
  };
}

function toDateInputValue(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

// The individual firing-team fitter's profile — mirrors
// stacking/OperatorDetailPage.tsx's structure: editable monthly salary +
// rotation anchor (the "shift adjustment" feature), earnings/balance
// breakdown, and full shift/attendance history, with a "remove from team"
// action (soft-deactivate, same convention as every other role in this app).
export function FitterDetailPage({ fitterId, onBack }: FitterDetailPageProps) {
  const { t } = useTranslation();
  const advanceCategoryLabels = useAdvanceCategoryLabels();
  const [fitter, setFitter] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [shiftHistory, setShiftHistory] = useState<FiringShift[]>([]);
  const [rosterEntry, setRosterEntry] = useState<FitterRosterEntry | null>(null);
  const [salaryInput, setSalaryInput] = useState("");
  const [anchorDateInput, setAnchorDateInput] = useState("");
  const [anchorTypeInput, setAnchorTypeInput] = useState<"" | ShiftType>("");
  const [savingRotation, setSavingRotation] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function refresh() {
    const [detail, ledger, history, roster] = await Promise.all([
      api.people.get(fitterId),
      api.people.listLedger(fitterId),
      api.firingShifts.list({ fitterId }),
      api.firingShifts.roster(),
    ]);
    setFitter(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setShiftHistory(history);
    setSalaryInput(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
    setAnchorDateInput(toDateInputValue(detail.person.firingShiftAnchorDate));
    setAnchorTypeInput(detail.person.firingShiftAnchorType ?? "");
    const allFitters = [...roster.dayShift, ...roster.nightShift, ...roster.unscheduled];
    setRosterEntry(allFitters.find((r) => r.fitter.id === fitterId) ?? null);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [fitterId]);

  useKilnEvent("firingShift:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveRotation(e: FormEvent) {
    e.preventDefault();
    setSavingRotation(true);
    try {
      await api.people.update(fitterId, {
        monthlySalary: salaryInput ? Number(salaryInput) : undefined,
        firingShiftAnchorDate: anchorDateInput || undefined,
        firingShiftAnchorType: anchorTypeInput || undefined,
      });
      await refresh();
    } finally {
      setSavingRotation(false);
    }
  }

  async function removeFromTeam() {
    if (!confirm(t("firing.confirmRemoveFromTeam", { name: fitter?.name ?? "" }))) return;
    setRemoving(true);
    try {
      await api.people.update(fitterId, { active: false });
      onBack();
    } finally {
      setRemoving(false);
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("firing.backToFiring")}
    </button>
  );

  if (!fitter) {
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

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{fitter.name}</h3>
          <p className="text-sm text-ink-muted">
            {t("firing.fitterRoleLabel")}
            {rosterEntry?.scheduledShiftType
              ? ` · ${t("firing.todayShift", { shift: rosterEntry.scheduledShiftType === "DAY" ? t("firing.dayShift") : t("firing.nightShift") })}`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setLedgerOpen(true)}>
            {t("firing.advanceSalary")}
          </Button>
          <button
            onClick={removeFromTeam}
            disabled={removing}
            className="rounded-lg border border-status-critical/40 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
          >
            {t("firing.removeFromTeam")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.fitterProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={fitter.phone} />
            <Field label={t("firing.address")} value={fitter.address} />
            <Field label={t("firing.aadharId")} value={fitter.idNumber} />
            <Field label={t("common.status")} value={fitter.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.salaryShiftRotation")}</h4>
          <form onSubmit={saveRotation} className="flex flex-col gap-2">
            <input
              type="number"
              value={salaryInput}
              onChange={(e) => setSalaryInput(e.target.value)}
              placeholder={t("firing.monthlySalaryPlaceholder")}
              className={inputClass}
            />
            <div className="flex gap-2">
              <DateInput
                value={anchorDateInput}
                onChange={(e) => setAnchorDateInput(e.target.value)}
                className={inputClass}
              />
              <select
                value={anchorTypeInput}
                onChange={(e) => setAnchorTypeInput(e.target.value as "" | ShiftType)}
                className={inputClass}
              >
                <option value="">{t("firing.startsOnPlaceholder")}</option>
                <option value="DAY">{t("firing.dayBlock")}</option>
                <option value="NIGHT">{t("firing.nightBlock")}</option>
              </select>
            </div>
            <Button type="submit" size="sm" disabled={savingRotation}>
              {t("common.save")}
            </Button>
          </form>
          <p className="mt-2 text-sm text-ink-muted">
            {t("firing.rotationExplanation")}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.earningsLedger")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
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
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("firing.netDue") : t("firing.advanceOutstanding")}</p>
            </div>
          </div>
          {advancesByCategory.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
              {Array.from(advancesByCategory.entries()).map(([category, amount]) => (
                <span key={category} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                  {advanceCategoryLabels[category] ?? category}: ₹{formatINR(amount)}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.shiftAttendanceHistory")}</h4>
          {shiftHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("firing.noShiftsLoggedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("firing.shiftHeader")}</th>
                    <th className="pb-2 font-medium">{t("firing.chamberHeader")}</th>
                    <th className="pb-2 font-medium">{t("firing.otBonusHeader")}</th>
                    <th className="pb-2 font-medium">{t("firing.handoverNotesHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftHistory.map((s) => (
                    <tr key={s._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(s.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3">
                        <Badge variant={s.shiftType === "DAY" ? "good" : "warning"}>{s.shiftType === "DAY" ? t("firing.day") : t("firing.night")}</Badge>
                      </td>
                      <td className="py-3 text-ink-secondary">{typeof s.gherId === "object" && s.gherId ? `#${s.gherId.number}` : "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">
                        {s.overtimeHours || s.bonusAmount
                          ? `₹${formatINR((s.overtimeHours ?? 0) * (s.overtimeRate ?? 0) + (s.bonusAmount ?? 0))}`
                          : "—"}
                      </td>
                      <td className="py-3 text-ink-secondary">{s.handoverNotes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {ledgerOpen && <LedgerModal person={fitter} onClose={() => setLedgerOpen(false)} />}
    </div>
  );
}
