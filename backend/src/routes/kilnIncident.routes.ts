import { Router } from "express";
import { create, list } from "../controllers/kilnIncident.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const kilnIncidentRouter = Router();

kilnIncidentRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
kilnIncidentRouter.post("/", asyncHandler(create));
kilnIncidentRouter.get("/", asyncHandler(list));
