import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createWorkEntry,
  deleteWorkEntry,
  listWorkEntries,
  pakayiContractorSummary,
  pakayiOperatorSummary,
  updateWorkEntry,
} from "../services/workEntry.service";
import { WORK_TYPES } from "../db/schema";

const createSchema = z.object({
  personId: z.string(),
  workType: z.enum(WORK_TYPES),
  quantity: z.number().positive(),
  ratePerThousand: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createWorkEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const entries = await listWorkEntries(req.kiln!.id, {
    personId: req.query.personId as string | undefined,
    workType: req.query.workType as (typeof WORK_TYPES)[number] | undefined,
  });
  res.json(entries);
}

const updateSchema = z.object({
  workType: z.enum(WORK_TYPES).optional(),
  quantity: z.number().positive().optional(),
  ratePerThousand: z.number().positive().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateWorkEntry(req.kiln!.id, req.params.id, input);
  res.json(entry);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteWorkEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function operatorSummary(req: AuthedRequest, res: Response) {
  const result = await pakayiOperatorSummary(req.kiln!.id);
  res.json(result);
}

export async function contractorSummary(req: AuthedRequest, res: Response) {
  const result = await pakayiContractorSummary(req.kiln!.id);
  res.json(result);
}
