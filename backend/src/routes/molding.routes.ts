import { Router } from "express";
import { contractorSummary, create, list, periodTotals, today } from "../controllers/molding.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const moldingRouter = Router();

moldingRouter.use(requireAuth, resolveKiln);
moldingRouter.post("/", asyncHandler(create));
moldingRouter.get("/", asyncHandler(list));
moldingRouter.get("/today", asyncHandler(today));
moldingRouter.get("/period-totals", asyncHandler(periodTotals));
moldingRouter.get("/contractor-summary", asyncHandler(contractorSummary));
