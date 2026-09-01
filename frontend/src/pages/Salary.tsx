import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import { StaffDetailPage } from "@/components/staff/StaffDetailPage";
import type { SalaryStatusEntry } from "@/types";

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Deliberately reuses the exact same StaffDetailPage component the People
// page's Staff tab opens (not a Salary-specific view) — this is what keeps
// the two pages "linked and synced": an edit made from either always shows
// up on the other immediately, since there's only one profile component
// and one underlying `people` record, never a second copy of the data.
export function Salary() {
  const { t } = useTranslation();
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const [cursor, setCursor] = useState(currentMonth);
  const [entries, setEntries] = useState<SalaryStatusEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);

  const month = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
  const monthLabel = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  async function refresh() {
    setEntries(await api.salary.status(month));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId, month]);

  useKilnEvent("salary:update", () => refresh());

  async function handleGenerate() {
    setGenerating(true);
    setLastResult(null);
    try {
      const result = await api.salary.generate(month);
      setLastResult(t("salary.generatedCount", { count: result.generated }));
      await refresh();
    } finally {
      setGenerating(false);
    }
  }

  if (openStaffId) {
    return <StaffDetailPage staffId={openStaffId} onBack={() => setOpenStaffId(null)} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("salary.pageTitle")}</CardTitle>
            <p className="mt-1 text-sm text-ink-muted">{t("salary.pageSubtitle")}</p>
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {generating ? t("salary.generating") : t("salary.generateNow")}
          </Button>
        </CardHeader>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCursor((c) => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-ink-primary/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-ink-primary">{monthLabel}</span>
          <button
            onClick={() => setCursor((c) => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-ink-primary/5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {lastResult && <p className="mt-2 text-center text-sm text-status-good">{lastResult}</p>}
      </Card>

      <Card>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("salary.noSalariedStaff")}</p>
        ) : (
          <div className="space-y-2">
            {entries.map(({ person, slip }) => (
              <button
                key={person._id}
                onClick={() => setOpenStaffId(person._id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
              >
                <div>
                  <p className="font-medium text-ink-primary">{person.name}</p>
                  <p className="text-sm text-ink-muted">
                    {person.designation}
                    {person.monthlySalary ? ` · ₹${formatINR(person.monthlySalary)}/mo` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {slip ? (
                    slip.netSalary < 0 ? (
                      <span className="font-semibold tabular-nums text-status-critical">
                        {t("salary.overdrawnBy", { amount: formatINR(Math.abs(slip.netSalary)) })}
                      </span>
                    ) : (
                      <span className="font-semibold tabular-nums text-ink-primary">₹{formatINR(slip.netSalary)}</span>
                    )
                  ) : (
                    <span className="rounded-full bg-ink-primary/5 px-2.5 py-1 text-sm text-ink-muted">{t("salary.status.pending")}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
