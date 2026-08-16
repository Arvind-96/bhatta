import { Router } from "express";
import {
  createKiln,
  finishOnboarding,
  listKilns,
  publicKiln,
  updateGeofence,
  updateProfile,
  updateSeason,
  updateShiftTimes,
  updateYardCapacity,
} from "../controllers/kiln.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const kilnRouter = Router();

kilnRouter.get("/public", asyncHandler(publicKiln));

kilnRouter.use(requireAuth);
kilnRouter.get("/", asyncHandler(listKilns));
kilnRouter.post("/", asyncHandler(createKiln));
kilnRouter.patch("/geofence", resolveKiln, asyncHandler(updateGeofence));
kilnRouter.patch("/yard-capacity", resolveKiln, asyncHandler(updateYardCapacity));
kilnRouter.patch("/season", resolveKiln, asyncHandler(updateSeason));
kilnRouter.patch("/shift-times", resolveKiln, asyncHandler(updateShiftTimes));
kilnRouter.patch("/profile", resolveKiln, asyncHandler(updateProfile));
kilnRouter.post("/onboarding/complete", resolveKiln, asyncHandler(finishOnboarding));
