import { Router } from "express";
import { create, list, totals, updateStatus } from "../controllers/soilTrip.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const soilTripRouter = Router();

soilTripRouter.use(requireAuth, resolveKiln);
soilTripRouter.post("/", asyncHandler(create));
soilTripRouter.get("/", asyncHandler(list));
soilTripRouter.get("/totals", asyncHandler(totals));
soilTripRouter.patch("/:id/status", asyncHandler(updateStatus));
