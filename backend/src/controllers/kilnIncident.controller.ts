import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createKilnIncident, listKilnIncidents } from "../services/kilnIncident.service";
import { INCIDENT_TYPES } from "../db/schema";

const createSchema = z.object({
  gherId: z.string().optional(),
  type: z.enum(INCIDENT_TYPES),
  description: z.string(),
  repairCost: z.number().min(0).optional(),
  bricksLost: z.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const incident = await createKilnIncident({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(incident);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 90;
  const incidents = await listKilnIncidents(req.kiln!.id, days);
  res.json(incidents);
}
