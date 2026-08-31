import { Router } from "express";
import { contractorSummary, create, list, periodTotals, remove, today, update } from "../controllers/molding.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const moldingRouter = Router();

moldingRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
moldingRouter.post("/", asyncHandler(create));
moldingRouter.get("/", asyncHandler(list));
moldingRouter.get("/today", asyncHandler(today));
moldingRouter.get("/period-totals", asyncHandler(periodTotals));
moldingRouter.get("/contractor-summary", asyncHandler(contractorSummary));
moldingRouter.patch("/:id", asyncHandler(update));
moldingRouter.delete("/:id", asyncHandler(remove));
