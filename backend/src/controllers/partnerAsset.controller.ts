import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createPartnerAsset,
  deletePartnerAsset,
  listPartnerAssets,
  updatePartnerAsset,
} from "../services/partnerAsset.service";
import { PARTNER_ASSET_TYPES } from "../db/schema";

const createSchema = z.object({
  partnerId: z.string(),
  assetType: z.enum(PARTNER_ASSET_TYPES),
  description: z.string().min(1),
  landAreaBigha: z.number().min(0).optional(),
  rentalRate: z.number().min(0).optional(),
  rentalRateUnit: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const asset = await createPartnerAsset({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(asset);
}

export async function list(req: AuthedRequest, res: Response) {
  const partnerId = req.query.partnerId as string | undefined;
  if (!partnerId) return res.json([]);
  const assets = await listPartnerAssets(req.kiln!.id, partnerId);
  res.json(assets);
}

const updateSchema = z.object({
  assetType: z.enum(PARTNER_ASSET_TYPES).optional(),
  description: z.string().min(1).optional(),
  landAreaBigha: z.number().min(0).nullable().optional(),
  rentalRate: z.number().min(0).nullable().optional(),
  rentalRateUnit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const asset = await updatePartnerAsset(req.kiln!.id, req.params.id, input);
  res.json(asset);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deletePartnerAsset(req.kiln!.id, req.params.id);
  res.status(204).end();
}
