import { Router } from "express";
import { chamberCost, summary } from "../controllers/financialReport.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const financialReportRouter = Router();

financialReportRouter.use(requireAuth, resolveKiln);
financialReportRouter.get("/summary", asyncHandler(summary));
financialReportRouter.get("/chamber-cost/:gherId", asyncHandler(chamberCost));
