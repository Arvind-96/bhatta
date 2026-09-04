import { istDateOnly } from "./istTime";

// "YYYY-MM" strings for every calendar month that overlaps [from, to] —
// salary slips are keyed by month string, not a date column, so
// range-filtering them needs this instead of a gte/lte date comparison.
// Backs Compare's salary module, where the admin picks an arbitrary date
// range via calendar rather than a fixed Aug1-Jul31 season.
//
// Bug fix: `from`/`to` already carry the correct IST instant (resolved
// upstream via istStartOfDayString/istEndOfDayString) — but reading
// `.getFullYear()`/`.getMonth()` on that instant used the server's own
// (UTC) local getters, which can read the wrong month for a date within
// ~5.5h of an IST month boundary. istDateOnly re-resolves the correct IST
// calendar date first.
export function monthStringsInRange(from: Date, to: Date): string[] {
  const fromIst = istDateOnly(from);
  const toIst = istDateOnly(to);
  const months: string[] = [];
  let y = fromIst.getUTCFullYear();
  let m = fromIst.getUTCMonth() + 1;
  const endY = toIst.getUTCFullYear();
  const endM = toIst.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}
