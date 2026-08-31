import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createSaltUsageLog, deleteSaltUsageLog, listSaltUsageLogs } from "../services/saltUsageLog.service";

const createSchema = z.object({
  siteId: z.string(),
  quantityKg: z.number().positive(),
  date: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createSaltUsageLog({ ...input, kilnId: req.kiln!.id, seasonId: req.season!.id }));
}

export async function list(req: AuthedRequest, res: Response) {
  const { siteId, from, to } = req.query;
  res.json(
    await listSaltUsageLogs(req.kiln!.id, {
      siteId: typeof siteId === "string" ? siteId : undefined,
      from: typeof from === "string" ? new Date(from) : undefined,
      to: typeof to === "string" ? new Date(to) : undefined,
    })
  );
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSaltUsageLog(req.kiln!.id, req.params.id);
  res.status(204).end();
}
