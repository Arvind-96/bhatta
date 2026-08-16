import { Router } from "express";
import { customRange, get } from "../controllers/financialOverview.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const financialOverviewRouter = Router();

financialOverviewRouter.use(requireAuth, resolveKiln);
financialOverviewRouter.get("/", asyncHandler(get));
financialOverviewRouter.get("/custom-range", asyncHandler(customRange));
