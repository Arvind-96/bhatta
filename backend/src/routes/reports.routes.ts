import { Router } from "express";
import { dashboardSummaryHandler, listReportKeys, runReport } from "../controllers/reports.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
reportsRouter.get("/", asyncHandler(listReportKeys));
// Registered before the /:key wildcard below so this static path always
// wins the match (Express resolves routes in registration order).
reportsRouter.get("/dashboard-summary", asyncHandler(dashboardSummaryHandler));
reportsRouter.get("/:key", asyncHandler(runReport));
