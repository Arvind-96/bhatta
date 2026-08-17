// "YYYY-MM" strings for every calendar month that overlaps [from, to] —
// salary slips are keyed by month string, not a date column, so
// range-filtering them needs this instead of a gte/lte date comparison.
// Backs Compare's salary module, where the admin picks an arbitrary date
// range via calendar rather than a fixed Aug1-Jul31 season.
export function monthStringsInRange(from: Date, to: Date): string[] {
  const months: string[] = [];
  let y = from.getFullYear();
  let m = from.getMonth() + 1;
  const endY = to.getFullYear();
  const endM = to.getMonth() + 1;
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
