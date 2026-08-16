import { Router } from "express";
import {
  createKiln,
  finishOnboarding,
  listKilns,
  updateGeofence,
  updateProfile,
  updateYardCapacity,
} from "../controllers/kiln.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const kilnRouter = Router();

kilnRouter.use(requireAuth);
kilnRouter.get("/", asyncHandler(listKilns));
kilnRouter.post("/", asyncHandler(createKiln));
kilnRouter.patch("/geofence", resolveKiln, asyncHandler(updateGeofence));
kilnRouter.patch("/yard-capacity", resolveKiln, asyncHandler(updateYardCapacity));
kilnRouter.patch("/profile", resolveKiln, asyncHandler(updateProfile));
kilnRouter.post("/onboarding/complete", resolveKiln, asyncHandler(finishOnboarding));
