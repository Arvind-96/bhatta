import { Router } from "express";
import { pushSync } from "../controllers/sync.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const syncRouter = Router();

syncRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
syncRouter.post("/push", asyncHandler(pushSync));
