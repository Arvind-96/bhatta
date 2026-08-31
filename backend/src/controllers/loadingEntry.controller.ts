import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createLoadingEntry, listLoadingEntries } from "../services/loadingEntry.service";

const createSchema = z.object({
  dispatchId: z.string().optional(),
  palledarId: z.string(),
  bricksCount: z.number().int().positive(),
  ratePerThousand: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const result = await createLoadingEntry({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(result);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const entries = await listLoadingEntries(req.kiln!.id, req.season!.id, days);
  res.json(entries);
}
