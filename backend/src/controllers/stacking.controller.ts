import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createStackingEntry,
  deleteStackingEntry,
  listStackingEntries,
  stackingContractorSummary,
  stackingOperatorSummary,
  tractorFleetSummary,
  updateStackingEntry,
} from "../services/stacking.service";
import { STACKING_QUALITY, STACKING_MODES, STACKING_STAGES, DAMAGE_FAULT_OPTIONS } from "../db/schema";

const createSchema = z.object({
  gherId: z.string(),
  gangId: z.string(),
  stage: z.enum(STACKING_STAGES),
  bricksCount: z.number().int().positive(),
  damageCount: z.number().int().min(0).optional(),
  damageFault: z.enum(DAMAGE_FAULT_OPTIONS).optional(),
  qualityRating: z.enum(STACKING_QUALITY).optional(),
  mode: z.enum(STACKING_MODES).optional(),
  tractorNumber: z.string().optional(),
  buggiCount: z.number().int().positive().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createStackingEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const entries = await listStackingEntries(req.kiln!.id, {
    gherId: req.query.gherId as string | undefined,
    gangId: req.query.gangId as string | undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json(entries);
}

const updateSchema = z.object({
  stage: z.enum(STACKING_STAGES).optional(),
  bricksCount: z.number().int().positive().optional(),
  damageCount: z.number().int().min(0).optional(),
  damageFault: z.enum(DAMAGE_FAULT_OPTIONS).optional(),
  qualityRating: z.enum(STACKING_QUALITY).optional(),
  mode: z.enum(STACKING_MODES).optional(),
  tractorNumber: z.string().optional(),
  buggiCount: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateStackingEntry(req.kiln!.id, req.params.id, input);
  res.json(entry);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteStackingEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function operatorSummary(req: AuthedRequest, res: Response) {
  const result = await stackingOperatorSummary(req.kiln!.id);
  res.json(result);
}

export async function tractorFleet(req: AuthedRequest, res: Response) {
  const result = await tractorFleetSummary(req.kiln!.id);
  res.json(result);
}

export async function contractorSummary(req: AuthedRequest, res: Response) {
  const result = await stackingContractorSummary(req.kiln!.id);
  res.json(result);
}
