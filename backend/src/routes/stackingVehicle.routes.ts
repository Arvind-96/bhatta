import { Router } from "express";
import { create, list, update } from "../controllers/stackingVehicle.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const stackingVehicleRouter = Router();

stackingVehicleRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
stackingVehicleRouter.post("/", asyncHandler(create));
stackingVehicleRouter.get("/", asyncHandler(list));
stackingVehicleRouter.patch("/:id", asyncHandler(update));
