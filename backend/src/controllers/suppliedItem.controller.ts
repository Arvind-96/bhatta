import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createSuppliedItem, deleteSuppliedItem, listSuppliedItems } from "../services/suppliedItem.service";

const createSchema = z.object({
  personId: z.string(),
  itemId: z.string(),
  quantity: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const supplied = await createSuppliedItem({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(supplied);
}

export async function list(req: AuthedRequest, res: Response) {
  const personId = req.query.personId as string | undefined;
  if (!personId) return res.json([]);
  const items = await listSuppliedItems(req.kiln!.id, req.season!.id, personId);
  res.json(items);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSuppliedItem(req.kiln!.id, req.params.id);
  res.status(204).end();
}
