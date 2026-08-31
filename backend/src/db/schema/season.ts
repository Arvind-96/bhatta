import { boolean, mysqlTable, varchar, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

// A "Bhatta Season" is an admin-configured operating period (not a fixed
// calendar/financial year) — the real "Start New Bhatta Season" boundary
// the admin controls from Settings. Exactly one row per kiln has
// isCurrent=true at a time; every transactional table's own `seasonId`
// column points at one of these. Master/reference data (people, customers,
// suppliers, brick categories, ...) deliberately never carries a seasonId
// at all — there's only ever one live roster, so nothing needs to be
// duplicated or "carried forward" when a new season starts. See
// season.service.ts for how starting a new season and balance
// carry-forward (opening balances summed through the selected season) work.
export const seasons = mysqlTable(
  "seasons",
  {
    _id: idColumn(),
    kilnId: kilnIdColumn(),
    label: varchar("label", { length: 255 }).notNull(),
    startDate: dateColumn("startDate").notNull(),
    isCurrent: boolean("isCurrent").notNull().default(false),
    createdAt: createdAtColumn(),
  },
  (t) => ({
    kilnIdx: index("season_kiln_idx").on(t.kilnId),
  })
);
