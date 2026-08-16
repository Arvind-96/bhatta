import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createBrickCategory,
  createBrickProductionEntry,
  createStockLoadingEntry,
  deleteBrickCategory,
  deleteBrickProductionEntry,
  deleteStockLoadingEntry,
  listBrickCategories,
  listBrickProductionEntries,
  listStockLoadingEntries,
  updateBrickCategory,
} from "../services/brickCategory.service";

const createCategorySchema = z.object({
  category: z.string().min(1),
  pricePerBrick: z.number().min(0).optional(),
});

export async function createCategory(req: AuthedRequest, res: Response) {
  const input = createCategorySchema.parse(req.body);
  const category = await createBrickCategory(req.kiln!.id, input.category, input.pricePerBrick);
  res.status(201).json(category);
}

export async function listCategories(req: AuthedRequest, res: Response) {
  const categories = await listBrickCategories(req.kiln!.id);
  res.json(categories);
}

const updateCategorySchema = z.object({
  quantity: z.number().optional(),
  pricePerBrick: z.number().min(0).optional(),
});

export async function updateCategoryQuantity(req: AuthedRequest, res: Response) {
  const input = updateCategorySchema.parse(req.body);
  const category = await updateBrickCategory(req.kiln!.id, req.params.id, input);
  res.json(category);
}

export async function removeCategory(req: AuthedRequest, res: Response) {
  await deleteBrickCategory(req.kiln!.id, req.params.id);
  res.status(204).end();
}

const createEntrySchema = z.object({
  categoryId: z.string(),
  bricksCount: z.number().int().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createProduction(req: AuthedRequest, res: Response) {
  const input = createEntrySchema.parse(req.body);
  const entry = await createBrickProductionEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function listProduction(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const entries = await listBrickProductionEntries(req.kiln!.id, days);
  res.json(entries);
}

export async function removeProduction(req: AuthedRequest, res: Response) {
  await deleteBrickProductionEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function createLoading(req: AuthedRequest, res: Response) {
  const input = createEntrySchema.parse(req.body);
  const entry = await createStockLoadingEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function listLoading(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const entries = await listStockLoadingEntries(req.kiln!.id, days);
  res.json(entries);
}

export async function removeLoading(req: AuthedRequest, res: Response) {
  await deleteStockLoadingEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}
