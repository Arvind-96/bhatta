import { Router } from "express";
import { create, list } from "../controllers/chamberGrading.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const chamberGradingRouter = Router();

chamberGradingRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
chamberGradingRouter.post("/", asyncHandler(create));
chamberGradingRouter.get("/", asyncHandler(list));
