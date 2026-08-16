import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createStockAudit, listStockAudits } from "../services/stockAudit.service";

const createSchema = z.object({
  itemName: z.string(),
  physicalCount: z.number().min(0),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const audit = await createStockAudit({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(audit);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 365;
  const audits = await listStockAudits(req.kiln!.id, days);
  res.json(audits);
}
