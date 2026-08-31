import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createPathaiSite, listPathaiSites, updatePathaiSite } from "../services/pathaiSite.service";
import { pathaiSiteOverview } from "../services/pathaiSiteOverview.service";

const createSchema = z.object({
  name: z.string().min(1),
  distanceKm: z.number().min(0).optional(),
  notes: z.string().optional(),
});
const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createPathaiSite({ ...input, kilnId: req.kiln!.id }));
}

export async function list(req: AuthedRequest, res: Response) {
  const includeInactive = req.query.includeInactive === "true";
  res.json(await listPathaiSites(req.kiln!.id, includeInactive));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updatePathaiSite(req.kiln!.id, req.params.id, input));
}

export async function overview(req: AuthedRequest, res: Response) {
  res.json(await pathaiSiteOverview(req.kiln!.id, req.season!.id));
}
