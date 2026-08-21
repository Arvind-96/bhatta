import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Printer, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import { EditSalarySlipModal } from "./EditSalarySlipModal";
import type { DayAttendance, LedgerEntry, SalarySlip } from "@/types";

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function currentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface SalarySlipHistoryProps {
  personId: string;
  // Passed down from StaffDetailPage (which already fetches the person's
  // full ledger for its own financial-ledger card) rather than re-fetched
  // here, so this stays a pure display component off data the parent
  // already owns.
  ledgerEntries: LedgerEntry[];
}

// Month-scoped salary panel: a Present/Absent/Advance-given summary for
// the currently-viewed month (the same numbers generateSalarySlip itself
// computes — see salary.service.ts), a manual "Generate Salary" button for
// that month, and the full slip history with per-slip Edit/Delete/Print.
export function SalarySlipHistory({ personId, ledgerEntries }: SalarySlipHistoryProps) {
  const { t } = useTranslation();
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [cursorMonth, setCursorMonth] = useState(currentMonthString);
  const [days, setDays] = useState<DayAttendance[]>([]);
  const [generating, setGenerating] = useState(false);
  const [editingSlip, setEditingSlip] = useState<SalarySlip | null>(null);

  async function refreshSlips() {
    setSlips(await api.salary.forPerson(personId));
  }

  async function refreshAttendance() {
    setDays(await api.attendance.forPerson(personId, cursorMonth));
  }

  useEffect(() => {
    refreshSlips().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  useEffect(() => {
    refreshAttendance().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, cursorMonth]);

  useKilnEvent("salary:update", () => refreshSlips());
  useKilnEvent("attendance:update", () => refreshAttendance());

  const daysPresent = days.filter((d) => d.status !== "ABSENT").length;
  const daysAbsent = days.filter((d) => d.status === "ABSENT").length;
  const advanceThisMonth = ledgerEntries
    .filter((e) => e.direction === "PAID" && e.category === "ADVANCE" && e.date.slice(0, 7) === cursorMonth)
    .reduce((sum, e) => sum + e.amount, 0);

  const slipForMonth = slips.find((s) => s.month === cursorMonth) ?? null;

  async function generate() {
    setGenerating(true);
    try {
      await api.salary.generateForPerson(personId, cursorMonth);
      await refreshSlips();
    } finally {
      setGenerating(false);
    }
  }

  async function deleteSlip(slip: SalarySlip) {
    if (!confirm(t("salary.confirmDeleteSlip", { month: monthLabel(slip.month) }))) return;
    await api.salary.remove(slip._id);
    await refreshSlips();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("salary.slipHistory")}</CardTitle>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursorMonth((m) => shiftMonth(m, -1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-ink-primary/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium text-ink-primary">{monthLabel(cursorMonth)}</span>
          <button
            onClick={() => setCursorMonth((m) => shiftMonth(m, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-ink-primary/5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-semibold tabular-nums text-status-good">{daysPresent}</p>
          <p className="text-xs text-ink-muted">{t("salary.daysPresent")}</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-status-critical">{daysAbsent}</p>
          <p className="text-xs text-ink-muted">{t("salary.daysAbsent")}</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(advanceThisMonth)}</p>
          <p className="text-xs text-ink-muted">{t("salary.totalAdvanceGivenLabel")}</p>
        </div>
      </div>

      <Button size="sm" onClick={generate} disabled={generating} className="mb-3 w-full">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {slipForMonth ? t("salary.regenerateForMonth") : t("salary.generateForMonth")}
      </Button>

      {slips.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("salary.noSlipsYet")}</p>
      ) : (
        <div className="space-y-2">
          {slips.map((slip) => (
            <div key={slip._id} className="rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-primary">{monthLabel(slip.month)}</p>
                  <p className="text-sm text-ink-muted">
                    {t("salary.daysPresent")} {slip.daysPresent} · {t("salary.daysAbsent")} {slip.daysAbsent}
                    {slip.daysHalfDay > 0 ? ` · ${t("salary.daysHalfDay")} ${slip.daysHalfDay}` : ""}
                    {slip.daysLate > 0 ? ` · ${t("salary.daysLate")} ${slip.daysLate}` : ""}
                    {slip.advanceDeducted > 0 ? ` · ${t("salary.advanceDeductedLabel")} ₹${formatINR(slip.advanceDeducted)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-ink-primary">₹{formatINR(slip.netSalary)}</span>
                  <a
                    href={api.salary.pdfUrl(slip._id, "en")}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-muted hover:text-ink-primary"
                    aria-label={t("common.print")}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => setEditingSlip(slip)} className="text-ink-muted hover:text-ink-primary" aria-label={t("common.edit")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteSlip(slip)} className="text-status-critical hover:opacity-80" aria-label={t("common.delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingSlip && <EditSalarySlipModal slip={editingSlip} onClose={() => setEditingSlip(null)} onSaved={refreshSlips} />}
    </Card>
  );
}
