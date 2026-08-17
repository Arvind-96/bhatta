// The kiln's business "season" runs from a configurable start date (default
// Aug 1) through the day before that same date the following calendar
// year — e.g. seasonYear 2025 with the default start = 2025-08-01 through
// 2026-07-31. `seasonYear` names a season by the calendar year it *starts*
// in, matching how the client refers to seasons ("2025" vs "2026").
export interface SeasonSetting {
  seasonStartMonth: number; // 1-12
  seasonStartDay: number; // 1-31
}

export interface SeasonBoundaries {
  from: Date;
  to: Date; // exclusive — the instant the next season starts
}

export function getSeasonBoundaries(setting: SeasonSetting, seasonYear: number): SeasonBoundaries {
  const from = new Date(seasonYear, setting.seasonStartMonth - 1, setting.seasonStartDay);
  const to = new Date(seasonYear + 1, setting.seasonStartMonth - 1, setting.seasonStartDay);
  return { from, to };
}

// Which season-year "today" falls in, given the same start-date setting —
// e.g. if the season starts Aug 1 and today is any day from 2026-08-01
// through 2027-07-31, this returns 2026. Used to default the Compare
// page's own season-year pickers.
export function currentSeasonYear(setting: SeasonSetting, reference = new Date()): number {
  const thisYearStart = new Date(reference.getFullYear(), setting.seasonStartMonth - 1, setting.seasonStartDay);
  return reference >= thisYearStart ? reference.getFullYear() : reference.getFullYear() - 1;
}

// "YYYY-MM" strings for every calendar month a season spans — salary slips
// are keyed by month string, not a date column, so range-filtering them
// needs this instead of a gte/lte date comparison.
export function seasonMonthStrings(setting: SeasonSetting, seasonYear: number): string[] {
  const months: string[] = [];
  let y = seasonYear;
  let m = setting.seasonStartMonth;
  for (let i = 0; i < 12; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}
