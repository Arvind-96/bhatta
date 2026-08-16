import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createChamberGrading, listGradings } from "../services/chamberGrading.service";

const createSchema = z.object({
  gherId: z.string(),
  a1Count: z.number().int().min(0),
  jhamaCount: z.number().int().min(0).optional(),
  pelaCount: z.number().int().min(0).optional(),
  rodaCount: z.number().int().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const result = await createChamberGrading({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(result);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 60;
  const gradings = await listGradings(req.kiln!.id, days);
  res.json(gradings);
}
