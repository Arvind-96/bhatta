import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { faceCheckIn, listAttendanceForDay, markAttendance } from "../services/attendance.service";

const markSchema = z.object({
  personId: z.string(),
  date: z.string(),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY"]),
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

const faceCheckInSchema = z.object({
  descriptor: z.array(z.number()).length(128),
  latitude: z.number(),
  longitude: z.number(),
});

export async function faceCheckInHandler(req: AuthedRequest, res: Response) {
  try {
    const input = faceCheckInSchema.parse(req.body);
    const result = await faceCheckIn({ kilnId: req.kiln!.id, ...input });
    res.status(201).json(result);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
}
