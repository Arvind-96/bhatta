import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, RosterEntry } from "@/types";

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-status-good/15 text-status-good border-status-good/30",
  ABSENT: "bg-status-critical/15 text-status-critical border-status-critical/30",
  HALF_DAY: "bg-status-warning/15 text-status-warning border-status-warning/30",
  LATE: "bg-amber-400/15 text-amber-600 border-amber-400/30",
};

const MARK_OPTIONS: AttendanceStatus[] = ["ABSENT", "HALF_DAY", "LATE"];

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusLabelKey(status: AttendanceStatus) {
  return `calendar.${status === "HALF_DAY" ? "halfDay" : status.toLowerCase()}`;
}

// The daily roster: every attendance-eligible staff member, defaulting to
// Present, with the admin marking exceptions right here — the same
// underlying attendances table AttendanceCalendar.tsx reads from, so a
// change here shows up on that person's profile calendar immediately (same
// "attendance:update" socket event, no separate sync needed).
export function Attendance() {
  const { t } = useTranslation();
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [date, setDate] = useState(todayString());
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setEntries(await api.attendance.roster(date));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId, date]);

  useKilnEvent("attendance:update", () => refresh());

  async function mark(personId: string, status: AttendanceStatus) {
    setSavingId(personId);
    try {
      await api.attendance.mark({ personId, date, status });
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-primary">{t("attendance.title")}</h2>
          <p className="text-sm text-ink-muted">{t("attendance.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {activeKiln?.dayShiftStart && (
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-sm text-ink-secondary">
              <Clock className="h-3.5 w-3.5 text-ink-muted" />
              {t("attendance.shiftLabel")}: {activeKiln.dayShiftStart}–{activeKiln.dayShiftEnd}
            </span>
          )}
          <DateInput
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          />
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        ) : entries.length === 0 ? (
          <EmptyState icon={Clock} title={t("attendance.noStaff")} />
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.person._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-primary">{entry.person.name}</p>
                  <p className="truncate text-sm text-ink-muted">{entry.person.designation ?? entry.person.type}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", STATUS_BADGE[entry.status])}>
                    {t(statusLabelKey(entry.status))}
                  </span>
                  {MARK_OPTIONS.filter((s) => s !== entry.status).map((status) => (
                    <button
                      key={status}
                      disabled={savingId === entry.person._id}
                      onClick={() => mark(entry.person._id, status)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50",
                        STATUS_BADGE[status]
                      )}
                    >
                      {t(statusLabelKey(status))}
                    </button>
                  ))}
                  {entry.status !== "PRESENT" && (
                    <button
                      disabled={savingId === entry.person._id}
                      onClick={() => mark(entry.person._id, "PRESENT")}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/5 disabled:opacity-50"
                    >
                      {t("calendar.resetToPresent")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
