import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { logWastage, listWastage } from "../services/wastage.service";
import { WASTAGE_CAUSES, WASTAGE_TYPES } from "../db/schema";

const createSchema = z.object({
  type: z.enum(WASTAGE_TYPES),
  cause: z.enum(WASTAGE_CAUSES),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await logWastage({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const entries = await listWastage(req.kiln!.id, req.season!.id, days);
  res.json(entries);
}
