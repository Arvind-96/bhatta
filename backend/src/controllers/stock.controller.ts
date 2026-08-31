import { Response } from "express";
import { z } from "zod";
import { getStockSnapshot, recordStockEntry } from "../services/stock.service";
import { AuthedRequest } from "../middleware/auth.middleware";

const createSchema = z.object({
  type: z.enum(["RAW_MATERIAL", "FINISHED_GOODS"]),
  itemName: z.string(),
  quantity: z.number(),
  unit: z.string().optional(),
  localId: z.string().optional(),
});

export async function createStockEntry(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await recordStockEntry({ ...input, kilnId: req.kiln!.id, seasonId: req.season!.id });
  res.status(201).json(entry);
}

export async function listStockSnapshot(req: AuthedRequest, res: Response) {
  const snapshot = await getStockSnapshot(req.kiln!.id, req.season!.id);
  res.json(snapshot);
}
