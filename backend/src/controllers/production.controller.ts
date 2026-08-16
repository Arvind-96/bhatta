import { Response } from "express";
import { z } from "zod";
import { createProductionLog, getProductionSeries, getTodayProduction } from "../services/production.service";
import { AuthedRequest } from "../middleware/auth.middleware";

const createSchema = z.object({
  batchNumber: z.string(),
  bricksCount: z.number().int().positive(),
  qualityGrade: z.string().optional(),
  thekedarId: z.string().optional(),
  localId: z.string().optional(),
});

export async function createProduction(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const log = await createProductionLog({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(log);
}

export async function listTodayProduction(req: AuthedRequest, res: Response) {
  const logs = await getTodayProduction(req.kiln!.id);
  res.json(logs);
}

export async function listProductionSeries(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 14;
  const series = await getProductionSeries(req.kiln!.id, days);
  res.json(series);
}
