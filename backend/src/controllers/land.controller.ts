import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createLand, getLand, listLands, updateLand } from "../services/land.service";
import { LAND_STATUSES } from "../db/schema";

const createSchema = z.object({
  landownerId: z.string(),
  name: z.string(),
  village: z.string().optional(),
  tehsil: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  khasraNumber: z.string().optional(),
  khataNumber: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  area: z.number().positive().optional(),
  areaUnit: z.string().optional(),
  soilType: z.string().optional(),
  estimatedSoilQuantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const land = await createLand({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(land);
}

export async function list(req: AuthedRequest, res: Response) {
  const lands = await listLands(req.kiln!.id, req.query.landownerId as string | undefined);
  res.json(lands);
}

export async function getOne(req: AuthedRequest, res: Response) {
  const land = await getLand(req.kiln!.id, req.params.id);
  res.json(land);
}

const updateSchema = createSchema.omit({ landownerId: true }).partial().extend({
  status: z.enum(LAND_STATUSES).optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const land = await updateLand(req.kiln!.id, req.params.id, input);
  res.json(land);
}
