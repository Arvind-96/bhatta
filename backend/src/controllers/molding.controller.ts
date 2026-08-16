import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createMoldingEntry,
  listMoldingEntries,
  moldingContractorSummary,
  moldingPeriodTotals,
  todayMoldingTotal,
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
