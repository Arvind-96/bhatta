import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createChamberGrading, listGradings } from "../services/chamberGrading.service";

const itemSchema = z.object({
  categoryId: z.string(),
  bricksCount: z.number().int().positive(),
});

const createSchema = z.object({
  gherId: z.string(),
  items: z.array(itemSchema).min(1, "At least one brick category is required"),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const result = await createChamberGrading({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(result);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 60;
  const gradings = await listGradings(req.kiln!.id, req.season!.id, days);
  res.json(gradings);
}
