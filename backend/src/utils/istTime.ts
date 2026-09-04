// This kiln operates in India (IST, UTC+5:30) but the VPS/Node process may
// run in any timezone (currently UTC) — using `new Date(); setHours(...)`,
// or parsing an admin-typed "YYYY-MM-DD" string with a bare `new Date(...)`,
// would silently compute the day/period boundary in whatever timezone the
// SERVER (or the JS date-parsing spec, for a date-only ISO string) happens
// to use, not the business's own calendar day. IST is 5.5 hours ahead of
// UTC, so entries logged just after IST midnight (already "today" to the
// admin) can still carry yesterday's UTC date, and a date-only string like
// "2026-09-10" parses as UTC midnight = IST 5:30am, not IST midnight.
//
// Both helpers convert "now" (or the given instant) to its IST wall-clock
// date/time first, zero the time-of-day there (or push it to 23:59:59.999),
// then convert that IST boundary back to the real UTC instant it
// corresponds to — so the boundary always matches the business's actual
// calendar day regardless of server timezone.
//
// Extracted from financialOverview.service.ts (the original home of
// istStartOfDay) so every controller/service that needs an IST day
// boundary — Financial Overview, Profit & Loss, Compare, Diesel period
// totals — shares one implementation instead of each re-deriving (and, as
// this audit found, sometimes mis-deriving) it independently.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istStartOfDay(date: Date): Date {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  istNow.setUTCHours(0, 0, 0, 0);
  return new Date(istNow.getTime() - IST_OFFSET_MS);
}

export function istEndOfDay(date: Date): Date {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  istNow.setUTCHours(23, 59, 59, 999);
  return new Date(istNow.getTime() - IST_OFFSET_MS);
}

// For a plain "YYYY-MM-DD" string straight off an <input type="date"> —
// parses the calendar date as IST midnight (start) / IST 23:59:59.999
// (end), not UTC midnight. Use these instead of `new Date(dateOnlyString)`
// anywhere a date-only string from the client needs to become a real range
// boundary.
export function istStartOfDayString(dateOnly: string): Date {
  return istStartOfDay(new Date(`${dateOnly}T00:00:00Z`));
}

export function istEndOfDayString(dateOnly: string): Date {
  return istEndOfDay(new Date(`${dateOnly}T00:00:00Z`));
}

// Resolves an instant to its IST calendar date, expressed the same way a
// plain "YYYY-MM-DD" string parses (UTC midnight of that date) — i.e. what
// a `new Date("YYYY-MM-DD")` call would produce if the admin had typed
// today's date into a <input type="date">. Several modules (Attendance,
// among others) store a date-only "calendar day" column matched by exact
// equality, written by parsing exactly that kind of string — defaulting
// "no date given" to a bare `new Date()` instead of resolving it through
// this function picks the wrong calendar day for the ~5.5h/day window
// where it's already tomorrow in IST but the server's own UTC clock
// hasn't rolled over yet. Use this (not istStartOfDay) wherever "today"
// needs to become a date-only key matching that convention, rather than a
// real-timestamp range boundary.
export function istDateOnly(date: Date): Date {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
}

// Same calendar-date resolution as istDateOnly, but returned as a
// "YYYY-MM-DD" string — for bucketing a real timestamp (e.g. a
// production log's producedOn) into its correct IST calendar day, instead
// of `date.toISOString().slice(0, 10)`, which reads the UTC calendar day
// and misbuckets any entry timestamped in the IST-midnight-to-5:30am
// window onto the previous day.
export function istDateKeyString(date: Date): string {
  return istDateOnly(date).toISOString().slice(0, 10);
}
