import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { firingShifts, people, ledgerEntries, ghers } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export interface CreateShiftInput {
  kilnId: string;
  seasonId: string;
  fitterId: string;
  gherId?: string;
  shiftType: "DAY" | "NIGHT";
  handoverNotes?: string;
  overtimeHours?: number;
  overtimeRate?: number;
  bonusAmount?: number;
  date?: Date;
}

// OT and performance bonus post straight to the fitter's ledger (same
// DUE/PAID balance every other role uses) — a fixed monthly salary itself
// is settled the same way ordinary wages are, via the ledger's existing
// PAID entries, so it doesn't need its own field here.
export async function createFiringShift(input: CreateShiftInput) {
  await assertPersonOfType(input.kilnId, input.fitterId, ["FITTER"]);

  const _id = randomUUID();
  await db.insert(firingShifts).values({ ...input, _id });
  const shift = (await db.select().from(firingShifts).where(eq(firingShifts._id, _id)))[0]!;

  const otAmount = (input.overtimeHours ?? 0) * (input.overtimeRate ?? 0);
  const totalDue = otAmount + (input.bonusAmount ?? 0);
  if (totalDue > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.fitterId,
      direction: "DUE",
      amount: totalDue,
      reason: `Shift OT/bonus (${input.shiftType.toLowerCase()} shift)`,
      date: input.date,
      category: "WAGE",
    });
  }

  emitToKiln(input.kilnId, "firingShift:update", shift);
  return shift;
}

export interface ListFiringShiftFilter {
  days?: number;
  fitterId?: string;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// report.service.ts's full person report).
export async function listFiringShifts(kilnId: string, seasonId: string | null, filter: ListFiringShiftFilter = {}) {
  const conditions = [eq(firingShifts.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(firingShifts.seasonId, seasonId));
  if (filter.from || filter.to) {
    if (filter.from) conditions.push(gte(firingShifts.date, filter.from));
    if (filter.to) conditions.push(lte(firingShifts.date, filter.to));
  } else {
    const since = new Date();
    since.setDate(since.getDate() - (filter.days ?? 14));
    conditions.push(gte(firingShifts.date, since));
  }
  if (filter.fitterId) conditions.push(eq(firingShifts.fitterId, filter.fitterId));

  const rows = await db.select().from(firingShifts).where(and(...conditions)).orderBy(desc(firingShifts.date));
  const fitterIds = [...new Set(rows.map((r) => r.fitterId))];
  const gherIds = [...new Set(rows.map((r) => r.gherId).filter((v): v is string => !!v))];
  const [fitterRows, gherRows] = await Promise.all([
    fitterIds.length ? db.select({ _id: people._id, name: people.name }).from(people).where(and(eq(people.kilnId, kilnId))) : [],
    gherIds.length ? db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(eq(ghers.kilnId, kilnId)) : [],
  ]);
  const fitterById = new Map(fitterRows.filter((f) => fitterIds.includes(f._id)).map((f) => [f._id, f]));
  const gherById = new Map(gherRows.filter((g) => gherIds.includes(g._id)).map((g) => [g._id, g]));
  return rows.map((r) => ({
    ...r,
    fitterId: fitterById.get(r.fitterId) ?? r.fitterId,
    gherId: r.gherId ? gherById.get(r.gherId) ?? r.gherId : r.gherId,
  }));
}

export type ScheduledShiftType = "DAY" | "NIGHT" | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = 6;
const BLOCK_DAYS = 3;

// The 6-person firing team rotates 3 days on the day shift, then 3 nights
// on the night shift, repeating every 6 days. A fitter's anchor is the
// start date of their *current* 3-day/3-night block plus which type that
// block is; every date's scheduled type is derived from it, so adjusting a
// fitter's rotation is just changing these two fields (Person.ts) rather
// than editing a stored calendar.
export function computeScheduledShiftType(
  anchorDate: Date | null | undefined,
  anchorType: "DAY" | "NIGHT" | null | undefined,
  forDate: Date
): ScheduledShiftType {
  if (!anchorDate || !anchorType) return null;

  const anchorMidnight = new Date(anchorDate);
  anchorMidnight.setHours(0, 0, 0, 0);
  const forMidnight = new Date(forDate);
  forMidnight.setHours(0, 0, 0, 0);

  const daysSince = Math.round((forMidnight.getTime() - anchorMidnight.getTime()) / MS_PER_DAY);
  if (daysSince < 0) return null;

  const cyclePos = daysSince % CYCLE_DAYS;
  const inAnchorBlock = cyclePos < BLOCK_DAYS;
  if (inAnchorBlock) return anchorType;
  return anchorType === "DAY" ? "NIGHT" : "DAY";
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// The firing team's roster for a given day (default today) — every active
// fitter's computed DAY/NIGHT assignment from their rotation anchor, split
// into day/night/unscheduled groups, plus each fitter's shift history count
// and ledger balance so the Firing page can show one screen with "who's on
// shift" and "who's owed what" together. targetTeamSize is the fixed
// 6-person team size this kiln is meant to run (flagged, not blocked, if
// the actual count drifts — same soft-warning convention as everywhere
// else in this app).
export async function fitterRosterSummary(kilnId: string, seasonId: string, forDate?: Date) {
  const date = forDate ?? new Date();
  const fitters = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "FITTER"), eq(people.active, true))).orderBy(asc(people.name));

  const results = await Promise.all(
    fitters.map(async (fitter) => {
      // Ledger balance stays all-time regardless of seasonId (see
      // listLedgerForPerson's doc comment in ledger.service.ts) — seasonId
      // on a ledger entry is optional and several real entries predate it,
      // so hard-filtering here would silently understate a fitter's
      // balance relative to every other balance display in the app.
      const [shifts, fitterLedgerEntries] = await Promise.all([
        db.select().from(firingShifts).where(and(eq(firingShifts.kilnId, kilnId), eq(firingShifts.seasonId, seasonId), eq(firingShifts.fitterId, fitter._id))).orderBy(desc(firingShifts.date)),
        db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, fitter._id))),
      ]);
      const { due, paid, balance } = sumByDirection(fitterLedgerEntries);

      return {
        fitter: {
          id: fitter._id,
          name: fitter.name,
          phone: fitter.phone,
          monthlySalary: fitter.monthlySalary ?? null,
          firingShiftAnchorDate: fitter.firingShiftAnchorDate ?? null,
          firingShiftAnchorType: fitter.firingShiftAnchorType ?? null,
        },
        scheduledShiftType: computeScheduledShiftType(fitter.firingShiftAnchorDate, fitter.firingShiftAnchorType as "DAY" | "NIGHT" | undefined, date),
        shiftCount: shifts.length,
        lastShiftDate: shifts[0]?.date ?? null,
        totalDue: due,
        totalPaid: paid,
        balance,
      };
    })
  );

  return {
    date: date.toISOString(),
    teamSize: fitters.length,
    targetTeamSize: 6,
    dayShift: results.filter((r) => r.scheduledShiftType === "DAY"),
    nightShift: results.filter((r) => r.scheduledShiftType === "NIGHT"),
    unscheduled: results.filter((r) => r.scheduledShiftType === null),
  };
}
