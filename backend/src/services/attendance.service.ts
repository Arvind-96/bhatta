import { randomUUID } from "crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { attendances, people } from "../db/schema";
import { emitToKiln } from "../config/socket";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LATE";

export interface MarkAttendanceInput {
  kilnId: string;
  personId: string;
  date: Date;
  status: AttendanceStatus;
  wageAmount?: number;
}

// Eligible for attendance marking: WORKER/HELPER (piece-rate) plus anyone
// with a monthlySalary set — not a fixed type list,
// since which types actually carry a monthly salary varies by kiln (this
// deployment's real data includes salaried FITTERs, for instance) and the
// Salary module needs attendance for exactly that same "has monthlySalary"
// population.
async function assertAttendanceEligible(kilnId: string, personId: string) {
  const person = db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))).get();
  if (!person) throw new Error("Person not found in this kiln");
  const eligible = person.type === "WORKER" || person.type === "HELPER" || person.monthlySalary != null;
  if (!eligible) throw new Error("This person isn't eligible for attendance tracking (no monthly salary, not a worker/helper)");
  return person;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function markAttendance(input: MarkAttendanceInput) {
  await assertAttendanceEligible(input.kilnId, input.personId);
  const day = startOfDay(input.date);

  const existing = db
    .select()
    .from(attendances)
    .where(and(eq(attendances.personId, input.personId), eq(attendances.date, day)))
    .get();

  if (existing) {
    db.update(attendances)
      .set({ kilnId: input.kilnId, status: input.status, wageAmount: input.wageAmount })
      .where(eq(attendances._id, existing._id))
      .run();
  } else {
    db.insert(attendances)
      .values({
        _id: randomUUID(),
        kilnId: input.kilnId,
        personId: input.personId,
        date: day,
        status: input.status,
        wageAmount: input.wageAmount,
      })
      .run();
  }

  const record = db
    .select()
    .from(attendances)
    .where(and(eq(attendances.personId, input.personId), eq(attendances.date, day)))
    .get()!;
  emitToKiln(input.kilnId, "attendance:update", record);
  return record;
}

export async function listAttendanceForDay(kilnId: string, date: Date) {
  const day = startOfDay(date);
  const rows = await db.select().from(attendances).where(and(eq(attendances.kilnId, kilnId), eq(attendances.date, day))).all();
  const personIds = [...new Set(rows.map((r) => r.personId))];
  if (personIds.length === 0) return rows;
  const peopleRows = await db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, personIds)).all();
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, personId: personById.get(r.personId) ?? r.personId }));
}

export interface DayAttendance {
  date: Date;
  status: AttendanceStatus;
  wageAmount: number | null;
  recorded: boolean; // false = no row exists, implicitly PRESENT
}

// Every day of the given month for one person, defaulting to PRESENT
// wherever no explicit row exists (see attendances table's schema comment
// for why rows are exceptions-only). Backs both the staff-profile calendar
// and salary-slip generation.
export async function attendanceForPersonMonth(
  kilnId: string,
  personId: string,
  year: number,
  month: number // 1-12
): Promise<DayAttendance[]> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of the month
  const daysInMonth = end.getDate();

  const rows = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.kilnId, kilnId), eq(attendances.personId, personId), gte(attendances.date, start), lte(attendances.date, end)))
    .all();
  const rowByDay = new Map(rows.map((r) => [startOfDay(r.date).getTime(), r]));

  const days: DayAttendance[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const row = rowByDay.get(date.getTime());
    days.push({
      date,
      status: (row?.status as AttendanceStatus) ?? "PRESENT",
      wageAmount: row?.wageAmount ?? null,
      recorded: !!row,
    });
  }
  return days;
}

export interface MonthAttendanceSummary {
  daysInMonth: number;
  daysPresent: number;
  daysAbsent: number;
  daysHalfDay: number;
  daysLate: number;
}

// Present/Absent/Half-day/Late day-counts for a month — Late counts as
// fully worked for pay purposes (see salary.service.ts's deduction
// formula) but is tallied separately since it's still worth surfacing on
// the slip.
export async function attendanceSummaryForMonth(
  kilnId: string,
  personId: string,
  year: number,
  month: number
): Promise<MonthAttendanceSummary> {
  const days = await attendanceForPersonMonth(kilnId, personId, year, month);
  const summary: MonthAttendanceSummary = { daysInMonth: days.length, daysPresent: 0, daysAbsent: 0, daysHalfDay: 0, daysLate: 0 };
  for (const d of days) {
    if (d.status === "ABSENT") summary.daysAbsent++;
    else if (d.status === "HALF_DAY") summary.daysHalfDay++;
    else if (d.status === "LATE") { summary.daysLate++; summary.daysPresent++; }
    else summary.daysPresent++;
  }
  return summary;
}

export interface RosterEntry {
  person: { _id: string; name: string; type: string; designation: string | null };
  status: AttendanceStatus;
  recorded: boolean;
}

// Every attendance-eligible person in the kiln, with their status for one
// specific date (present-by-default, same rule as attendanceForPersonMonth)
// — powers the Attendance page's daily roster, where the admin marks
// exceptions directly against the full staff list rather than one person's
// calendar at a time.
export async function listAttendanceRoster(kilnId: string, date: Date): Promise<RosterEntry[]> {
  const day = startOfDay(date);

  const eligiblePeople = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.active, true)))
    .all();
  const rosterPeople = eligiblePeople.filter((p) => p.type === "WORKER" || p.type === "HELPER" || p.monthlySalary != null);
  if (rosterPeople.length === 0) return [];

  const rows = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.kilnId, kilnId), eq(attendances.date, day), inArray(attendances.personId, rosterPeople.map((p) => p._id))))
    .all();
  const rowByPerson = new Map(rows.map((r) => [r.personId, r]));

  return rosterPeople
    .map((p) => {
      const row = rowByPerson.get(p._id);
      return {
        person: { _id: p._id, name: p.name, type: p.type, designation: p.designation },
        status: (row?.status as AttendanceStatus) ?? "PRESENT",
        recorded: !!row,
      };
    })
    .sort((a, b) => a.person.name.localeCompare(b.person.name));
}
