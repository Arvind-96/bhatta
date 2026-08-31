import { Router } from "express";
import { detail, profitShare } from "../controllers/partner.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const partnerRouter = Router();

partnerRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
partnerRouter.get("/:id", asyncHandler(detail));
partnerRouter.get("/:id/profit-share", asyncHandler(profitShare));
