import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { attendanceForPersonMonth, listAttendanceForDay, listAttendanceRoster, markAttendance } from "../services/attendance.service";

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
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();
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
  const entries = await listAttendanceRoster(req.kiln!.id, date ? new Date(date) : new Date());
  res.json(entries);
}
