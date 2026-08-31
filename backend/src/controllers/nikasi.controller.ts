import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createNikasiEntry,
  deleteNikasiEntry,
  listNikasiEntries,
  nikasiContractorSummary,
  nikasiOperatorSummary,
  nikasiPeriodTotals,
  updateNikasiEntry,
} from "../services/nikasi.service";

const damageFaultSchema = z.enum(["LABOURER", "CONTRACTOR", "OTHER"]);

const createSchema = z.object({
  gherId: z.string(),
  gangId: z.string(),
  bricksCount: z.number().int().positive(),
  damagedCount: z.number().int().nonnegative().optional(),
  damageFault: damageFaultSchema.optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createNikasiEntry({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const entries = await listNikasiEntries(req.kiln!.id, req.season!.id, {
    gherId: req.query.gherId as string | undefined,
    gangId: req.query.gangId as string | undefined,
  });
  res.json(entries);
}

const updateSchema = z.object({
  bricksCount: z.number().int().positive().optional(),
  damagedCount: z.number().int().nonnegative().optional(),
  damageFault: damageFaultSchema.optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateNikasiEntry(req.kiln!.id, req.params.id, input);
  res.json(entry);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteNikasiEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function operatorSummary(req: AuthedRequest, res: Response) {
  const result = await nikasiOperatorSummary(req.kiln!.id, req.season!.id);
  res.json(result);
}

export async function contractorSummary(req: AuthedRequest, res: Response) {
  const result = await nikasiContractorSummary(req.kiln!.id, req.season!.id);
  res.json(result);
}

export async function periodTotals(req: AuthedRequest, res: Response) {
  const result = await nikasiPeriodTotals(req.kiln!.id, req.season!.id);
  res.json(result);
}
