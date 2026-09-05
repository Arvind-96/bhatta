import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createFiringShift, deleteFiringShift, fitterRosterSummary, listFiringShifts } from "../services/firingShift.service";
import { SHIFT_TYPES } from "../db/schema";

const createSchema = z.object({
  fitterId: z.string(),
  gherId: z.string().optional(),
  shiftType: z.enum(SHIFT_TYPES),
  handoverNotes: z.string().optional(),
  overtimeHours: z.number().min(0).optional(),
  overtimeRate: z.number().min(0).optional(),
  bonusAmount: z.number().min(0).optional(),
  date: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const shift = await createFiringShift({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(shift);
}

export async function list(req: AuthedRequest, res: Response) {
  const shifts = await listFiringShifts(req.kiln!.id, req.season!.id, {
    days: req.query.days ? Number(req.query.days) : undefined,
    fitterId: req.query.fitterId as string | undefined,
  });
  res.json(shifts);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteFiringShift(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function roster(req: AuthedRequest, res: Response) {
  const date = req.query.date ? new Date(String(req.query.date)) : undefined;
  const result = await fitterRosterSummary(req.kiln!.id, req.season!.id, date);
  res.json(result);
}
