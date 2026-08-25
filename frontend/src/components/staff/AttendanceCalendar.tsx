import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, DayAttendance } from "@/types";

// Four genuinely distinct hues — HALF_DAY and LATE used to both land in
// the yellow/amber family (status-warning vs. amber-400), which read as
// the same color at a glance. Present/Absent/Half-day/Late now each get
// their own series tone instead.
const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: "bg-status-good/15 text-status-good border-status-good/30",
  ABSENT: "bg-status-critical/15 text-status-critical border-status-critical/30",
  HALF_DAY: "bg-series-3/15 text-series-3 border-series-3/30",
  LATE: "bg-series-2/15 text-series-2 border-series-2/30",
};

const MARK_OPTIONS: AttendanceStatus[] = ["ABSENT", "HALF_DAY", "LATE"];

// Month-navigable grid, one cell per day, colored by computed status —
// every day defaults to Present unless the admin marked an exception (see
// backend attendance.service.ts). Clicking a day lets the admin set or
// clear an exception right there.
export function AttendanceCalendar({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [days, setDays] = useState<DayAttendance[]>([]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const month = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
    const result = await api.attendance.forPerson(personId, month);
    setDays(result);
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, cursor.year, cursor.month]);

  useKilnEvent("attendance:update", () => refresh());

  async function mark(date: string, status: AttendanceStatus) {
    setSaving(true);
    try {
      await api.attendance.mark({ personId, date, status });
      await refresh();
      setOpenDate(null);
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstWeekday = new Date(cursor.year, cursor.month - 1, 1).getDay();
  const leadingBlanks = Array.from({ length: firstWeekday });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("calendar.title")}</CardTitle>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor((c) => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-ink-primary/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium text-ink-primary">{monthLabel}</span>
          <button
            onClick={() => setCursor((c) => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-ink-primary/5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>

      <p className="mb-3 text-sm text-ink-muted">{t("calendar.defaultPresentNote")}</p>

      <div className="grid max-w-sm grid-cols-7 gap-1.5">
        {leadingBlanks.map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day, index) => {
          // Derived from the array position (days[0] is always the 1st of
          // the month, in order — see attendanceForPersonMonth) rather than
          // parsing day.date with the Date object's local-timezone getters,
          // which would show the wrong day number in any browser whose
          // timezone sits behind UTC relative to the server's calendar day.
          const dayOfMonth = index + 1;
          const dateKey = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
          return (
            <button
              key={dateKey}
              onClick={() => setOpenDate(dateKey)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                STATUS_DOT[day.status]
              )}
              title={t(`calendar.${day.status === "HALF_DAY" ? "halfDay" : day.status.toLowerCase()}`)}
            >
              {dayOfMonth}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-sm text-ink-muted">
        {(["PRESENT", "ABSENT", "HALF_DAY", "LATE"] as AttendanceStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-full border", STATUS_DOT[s])} />
            {t(`calendar.${s === "HALF_DAY" ? "halfDay" : s.toLowerCase()}`)}
          </span>
        ))}
      </div>

      {openDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/40 backdrop-blur-sm" onClick={() => setOpenDate(null)}>
          <div className="glass-panel w-72 rounded-2xl p-4 shadow-glass" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-medium text-ink-primary">{t("calendar.markFor", { date: openDate })}</p>
            <div className="flex flex-col gap-1.5">
              {MARK_OPTIONS.map((status) => (
                <button
                  key={status}
                  disabled={saving}
                  onClick={() => mark(openDate, status)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm font-medium hover:opacity-80 disabled:opacity-50",
                    STATUS_DOT[status]
                  )}
                >
                  {t(`calendar.${status === "HALF_DAY" ? "halfDay" : status.toLowerCase()}`)}
                </button>
              ))}
              <button
                disabled={saving}
                onClick={() => mark(openDate, "PRESENT")}
                className="rounded-lg border border-border px-3 py-2 text-left text-sm text-ink-secondary hover:bg-ink-primary/5 disabled:opacity-50"
              >
                {t("calendar.resetToPresent")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
