import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createFuelLog, fuelLogPeriodTotals, listFuelLogs } from "../services/fuelLog.service";
import { fuelEfficiency } from "../services/firingEfficiency.service";

const createSchema = z.object({
  gherId: z.string(),
  fuelType: z.string().min(1),
  quantityKg: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const log = await createFuelLog({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(log);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 14;
  const logs = await listFuelLogs(req.kiln!.id, days);
  res.json(logs);
}

export async function efficiency(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 7;
  const baselineDays = req.query.baselineDays ? Number(req.query.baselineDays) : 30;
  const result = await fuelEfficiency(req.kiln!.id, days, baselineDays);
  res.json(result);
}

export async function periodTotals(req: AuthedRequest, res: Response) {
  const result = await fuelLogPeriodTotals(req.kiln!.id);
  res.json(result);
}
