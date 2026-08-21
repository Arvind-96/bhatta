import { Router } from "express";
import { listReportKeys, runReport } from "../controllers/reports.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, resolveKiln);
reportsRouter.get("/", asyncHandler(listReportKeys));
reportsRouter.get("/:key", asyncHandler(runReport));
