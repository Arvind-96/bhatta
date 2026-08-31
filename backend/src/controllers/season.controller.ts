import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createSeason, listSeasons } from "../services/season.service";

const createSchema = z.object({
  label: z.string().min(1),
  startDate: z.coerce.date(),
});

export async function list(req: AuthedRequest, res: Response) {
  res.json(await listSeasons(req.kiln!.id));
}

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createSeason(req.kiln!.id, input));
}
