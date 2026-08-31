import { Router } from "express";
import { create, driverSummary, list, remove, update } from "../controllers/brickLoading.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const brickLoadingRouter = Router();

brickLoadingRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
brickLoadingRouter.post("/", asyncHandler(create));
brickLoadingRouter.get("/", asyncHandler(list));
brickLoadingRouter.get("/driver-summary", asyncHandler(driverSummary));
brickLoadingRouter.patch("/:id", asyncHandler(update));
brickLoadingRouter.delete("/:id", asyncHandler(remove));
