import { Router } from "express";
import { detail, listWithSummary } from "../controllers/salesAgent.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const salesAgentRouter = Router();

salesAgentRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
salesAgentRouter.get("/", asyncHandler(listWithSummary));
salesAgentRouter.get("/:id", asyncHandler(detail));
