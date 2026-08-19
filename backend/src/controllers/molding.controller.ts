import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createMoldingEntry,
  deleteMoldingEntry,
  listMoldingEntries,
  moldingContractorSummary,
  moldingPeriodTotals,
  todayMoldingTotal,
  updateMoldingEntry,
} from "../services/molding.service";

const createSchema = z.object({
  workerId: z.string(),
  bricksCount: z.number().int().positive(),
  ratePerThousand: z.number().positive(),
  damagedCount: z.number().int().nonnegative().optional(),
  date: z.string().optional(),
  washedOut: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createMoldingEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const entries = await listMoldingEntries(req.kiln!.id, {
    workerId: req.query.workerId as string | undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json(entries);
}

export async function today(req: AuthedRequest, res: Response) {
  const total = await todayMoldingTotal(req.kiln!.id);
  res.json({ total });
}

export async function periodTotals(req: AuthedRequest, res: Response) {
  const result = await moldingPeriodTotals(req.kiln!.id);
  res.json(result);
}

export async function contractorSummary(req: AuthedRequest, res: Response) {
  const result = await moldingContractorSummary(req.kiln!.id);
  res.json(result);
}

const updateSchema = z.object({
  bricksCount: z.number().int().positive().optional(),
  ratePerThousand: z.number().positive().optional(),
  damagedCount: z.number().int().nonnegative().optional(),
  washedOut: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateMoldingEntry(req.kiln!.id, req.params.id, input);
  res.json(entry);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteMoldingEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}
