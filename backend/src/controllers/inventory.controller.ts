import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createInventoryItem,
  deleteInventoryItem,
  listInventoryItems,
  updateInventoryItem,
} from "../services/inventory.service";

const createSchema = z.object({
  name: z.string(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const item = await createInventoryItem({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(item);
}

export async function list(req: AuthedRequest, res: Response) {
  const items = await listInventoryItems(req.kiln!.id);
  res.json(items);
}

const updateSchema = z.object({
  name: z.string().optional(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const item = await updateInventoryItem(req.kiln!.id, req.params.id, input);
  res.json(item);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteInventoryItem(req.kiln!.id, req.params.id);
  res.status(204).end();
}
