import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { attendanceForPersonMonth, listAttendanceForDay, listAttendanceRoster, markAttendance } from "../services/attendance.service";
import { istDateOnly } from "../utils/istTime";

const markSchema = z.object({
  personId: z.string(),
  date: z.string(),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "LATE"]),
  wageAmount: z.number().optional(),
});

export async function mark(req: AuthedRequest, res: Response) {
  const input = markSchema.parse(req.body);
  const record = await markAttendance({
    kilnId: req.kiln!.id,
    personId: input.personId,
    date: new Date(input.date),
    status: input.status,
    wageAmount: input.wageAmount,
  });
  res.status(201).json(record);
}

export async function listForDay(req: AuthedRequest, res: Response) {
  // Bug fix: defaulting to a bare `new Date()` resolved "today" in the
  // server's own (UTC) calendar day, not IST — during the ~5.5h window
  // where it's already tomorrow in IST but still "today" in UTC, this
  // silently showed yesterday's roster. istDateOnly resolves the correct
  // IST calendar date first.
  const date = req.query.date ? new Date(String(req.query.date)) : istDateOnly(new Date());
  const records = await listAttendanceForDay(req.kiln!.id, date);
  res.json(records);
}

const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
});

export async function forPerson(req: AuthedRequest, res: Response) {
  const { month } = monthQuerySchema.parse(req.query);
  const [year, monthNum] = month.split("-").map(Number);
  const days = await attendanceForPersonMonth(req.kiln!.id, req.params.personId, year, monthNum);
  res.json(days);
}

const rosterQuerySchema = z.object({
  date: z.string().optional(),
});

export async function roster(req: AuthedRequest, res: Response) {
  const { date } = rosterQuerySchema.parse(req.query);
  // Same IST-"today" bug fix as listForDay above.
  const entries = await listAttendanceRoster(req.kiln!.id, date ? new Date(date) : istDateOnly(new Date()));
  res.json(entries);
}
