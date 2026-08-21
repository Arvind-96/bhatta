export type ReportGroupBy = "none" | "day" | "week" | "month" | "quarter" | "year";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Monday-start ISO week key ("2026-W34") — matches the common "7-day
// kharchi cycle" mental model better than a Sunday-start week would.
function isoWeekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`;
}

// The bucket key AND its human-readable label — the label is what a report
// row actually displays (the key is only used to group rows together).
export function bucketForDate(date: Date, period: Exclude<ReportGroupBy, "none">): { key: string; label: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  switch (period) {
    case "day": {
      const key = `${y}-${pad(m + 1)}-${pad(date.getDate())}`;
      return { key, label: key };
    }
    case "week": {
      const key = isoWeekKey(date);
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
    if (!date) continue;
    const { key, label } = bucketForDate(date, period);
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
