import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { partnerAssets, PARTNER_ASSET_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export type PartnerAssetType = (typeof PARTNER_ASSET_TYPES)[number];

export interface CreatePartnerAssetInput {
  kilnId: string;
  partnerId: string;
  assetType: PartnerAssetType;
  description: string;
  landAreaBigha?: number;
  rentalRate?: number;
  rentalRateUnit?: string;
  notes?: string;
}

export async function createPartnerAsset(input: CreatePartnerAssetInput) {
  await assertPersonOfType(input.kilnId, input.partnerId, ["PARTNER"]);
  const _id = randomUUID();
  await db.insert(partnerAssets).values({ ...input, _id });
  const asset = (await db.select().from(partnerAssets).where(eq(partnerAssets._id, _id)))[0]!;
  emitToKiln(input.kilnId, "partnerAsset:update", asset);
  return asset;
}

export async function listPartnerAssets(kilnId: string, partnerId: string) {
  return db
    .select()
    .from(partnerAssets)
    .where(and(eq(partnerAssets.kilnId, kilnId), eq(partnerAssets.partnerId, partnerId)))
    .orderBy(asc(partnerAssets.createdAt));
}

export interface UpdatePartnerAssetInput {
  assetType?: PartnerAssetType;
  description?: string;
  landAreaBigha?: number | null;
  rentalRate?: number | null;
  rentalRateUnit?: string | null;
  notes?: string | null;
}

export async function updatePartnerAsset(kilnId: string, assetId: string, input: UpdatePartnerAssetInput) {
  const existing = (await db.select().from(partnerAssets).where(and(eq(partnerAssets._id, assetId), eq(partnerAssets.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Partner asset not found in this kiln");
  await db.update(partnerAssets).set(input).where(eq(partnerAssets._id, assetId));
  const updated = (await db.select().from(partnerAssets).where(eq(partnerAssets._id, assetId)))[0]!;
  emitToKiln(kilnId, "partnerAsset:update", updated);
  return updated;
}

export async function deletePartnerAsset(kilnId: string, assetId: string) {
  const existing = (await db.select().from(partnerAssets).where(and(eq(partnerAssets._id, assetId), eq(partnerAssets.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Partner asset not found in this kiln");
  await db.delete(partnerAssets).where(eq(partnerAssets._id, assetId));
  emitToKiln(kilnId, "partnerAsset:update", { _id: assetId, deleted: true });
  return existing;
}
