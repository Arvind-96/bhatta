import { Router } from "express";
import { list, roundSpeed, setup, updateStatus } from "../controllers/gher.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const gherRouter = Router();

gherRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
gherRouter.post("/setup", asyncHandler(setup));
gherRouter.get("/", asyncHandler(list));
gherRouter.get("/round-speed", asyncHandler(roundSpeed));
gherRouter.patch("/:id/status", asyncHandler(updateStatus));
