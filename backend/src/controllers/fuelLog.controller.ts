import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createFuelLog, deleteFuelLog, fuelLogPeriodTotals, listFuelLogs, updateFuelLog } from "../services/fuelLog.service";
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

const updateSchema = z.object({
  gherId: z.string().optional(),
  fuelType: z.string().min(1).optional(),
  quantityKg: z.number().positive().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const log = await updateFuelLog(req.kiln!.id, req.params.id, input);
  res.json(log);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteFuelLog(req.kiln!.id, req.params.id);
  res.status(204).end();
}
