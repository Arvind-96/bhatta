import { Router } from "express";
import { create, list, remove, update } from "../controllers/partnerAsset.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const partnerAssetRouter = Router();

partnerAssetRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
partnerAssetRouter.post("/", asyncHandler(create));
partnerAssetRouter.get("/", asyncHandler(list));
partnerAssetRouter.patch("/:id", asyncHandler(update));
partnerAssetRouter.delete("/:id", asyncHandler(remove));
