import { Router } from "express";
import { create, list, remove } from "../controllers/saltUsageLog.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const saltUsageLogRouter = Router();

saltUsageLogRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
saltUsageLogRouter.post("/", asyncHandler(create));
saltUsageLogRouter.get("/", asyncHandler(list));
saltUsageLogRouter.delete("/:id", asyncHandler(remove));
