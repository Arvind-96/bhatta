import { Router } from "express";
import { create, list } from "../controllers/kilnIncident.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const kilnIncidentRouter = Router();

kilnIncidentRouter.use(requireAuth, resolveKiln);
kilnIncidentRouter.post("/", asyncHandler(create));
kilnIncidentRouter.get("/", asyncHandler(list));
