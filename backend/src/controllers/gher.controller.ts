import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { ensureGherCount, fireRoundSpeed, listGhers, updateGherStatus } from "../services/gher.service";
import { chamberOverview } from "../services/chamberOverview.service";
import { GHER_STATUSES } from "../db/schema";

const setupSchema = z.object({ count: z.number().int().positive().max(200) });
const statusSchema = z.object({ status: z.enum(GHER_STATUSES) });

export async function setup(req: AuthedRequest, res: Response) {
  const input = setupSchema.parse(req.body);
  const ghers = await ensureGherCount(req.kiln!.id, input.count);
  res.status(201).json(ghers);
}

export async function list(req: AuthedRequest, res: Response) {
  const ghers = await listGhers(req.kiln!.id);
  res.json(ghers);
}

export async function updateStatus(req: AuthedRequest, res: Response) {
  const input = statusSchema.parse(req.body);
  const gher = await updateGherStatus(req.kiln!.id, req.season!.id, req.params.id, input.status);
  res.json(gher);
}

export async function roundSpeed(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 14;
  const result = await fireRoundSpeed(req.kiln!.id, req.season!.id, days);
  res.json(result);
}

export async function overview(req: AuthedRequest, res: Response) {
  const result = await chamberOverview(req.kiln!.id, req.season!.id);
  res.json(result);
}
