import { Router } from "express";
import { get } from "../controllers/profitLoss.controller";
import { requireAuth, resolveKiln, resolveSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const profitLossRouter = Router();

profitLossRouter.use(requireAuth, resolveKiln, resolveSeason);
profitLossRouter.get("/", asyncHandler(get));
