import { istDateOnly } from "./istTime";

export type ReportGroupBy = "none" | "day" | "week" | "month" | "quarter" | "year";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Monday-start ISO week key ("2026-W34") — matches the common "7-day
// kharchi cycle" mental model better than a Sunday-start week would.
// `istMidnight` is already resolved to the correct IST calendar date
// (UTC-midnight-anchored — see istDateOnly), so every getUTC* read here is
// reading IST wall-clock date components, not the server's own timezone.
function isoWeekKey(istMidnight: Date) {
  const d = new Date(istMidnight);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`;
}

// The bucket key AND its human-readable label — the label is what a report
// row actually displays (the key is only used to group rows together).
//
// Bug fix: this used to read `date.getFullYear()`/`getMonth()`/`getDate()`
// — the server's own local timezone (UTC on the VPS), not IST. An entry
// timestamped between IST midnight and 5:30am landed in the previous
// day's/week's/month's bucket instead of the correct one — the same class
// of bug already fixed for Financial Overview/Profit & Loss/Compare/
// Reports' own date filter via istTime.ts, but this grouping path was
// never migrated to it. Resolving to the IST calendar date FIRST (via
// istDateOnly), then reading its components with UTC getters, makes every
// bucket below IST-correct regardless of server timezone.
export function bucketForDate(date: Date, period: Exclude<ReportGroupBy, "none">): { key: string; label: string } {
  const ist = istDateOnly(date);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  switch (period) {
    case "day": {
      const key = `${y}-${pad(m + 1)}-${pad(ist.getUTCDate())}`;
      return { key, label: key };
    }
    case "week": {
      const key = isoWeekKey(ist);
      return { key, label: key };
    }
    case "month": {
      const key = `${y}-${pad(m + 1)}`;
      return { key, label: `${MONTH_NAMES[m]} ${y}` };
    }
    case "quarter": {
      const q = Math.floor(m / 3) + 1;
      const key = `${y}-Q${q}`;
      return { key, label: key };
    }
    case "year": {
      const key = String(y);
      return { key, label: key };
    }
  }
}

// Collapses detail rows into period buckets, summing the given numeric
// fields and keeping a count — used by any report when the caller asks for
// groupBy=day/week/month/quarter/year instead of the raw detail rows.
// Bug fix: a row with no date (every date column in this app is nullable —
// a real, reachable state for legacy rows) used to be silently dropped
// entirely by `continue` here — invisible in the grouped view, but still
// counted by every report that separately totals off the full ungrouped
// detail array. That made the visible grouped rows not sum to the report's
// own footer, and meant the same report's Total could change purely by
// toggling Group By. Routing it into an explicit "No date" bucket instead
// keeps every row accounted for exactly once, in both views. Sorted last
// (its key starts with "9999", after any real year) since a row's actual
// date is unknown, not a legitimate late period.
const NO_DATE_KEY = "9999-unknown";

export function groupRowsByPeriod<T extends Record<string, unknown>>(
  rows: T[],
  dateField: keyof T,
  sumFields: (keyof T)[],
  period: Exclude<ReportGroupBy, "none">
): Array<{ period: string; count: number; [sumField: string]: number | string }> {
  const buckets = new Map<string, { period: string; count: number; sums: Record<string, number> }>();
  for (const row of rows) {
    const raw = row[dateField];
    const date = raw instanceof Date ? raw : raw ? new Date(raw as string) : null;
    const { key, label } = date ? bucketForDate(date, period) : { key: NO_DATE_KEY, label: "No date" };
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { period: label, count: 0, sums: Object.fromEntries(sumFields.map((f) => [String(f), 0])) };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    for (const f of sumFields) {
      const v = row[f];
      if (typeof v === "number") bucket.sums[String(f)] += v;
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => ({ period: b.period, count: b.count, ...b.sums }));
}
