import { Router } from "express";
import {
  createKiln,
  finishOnboarding,
  getSignature,
  listKilns,
  publicKiln,
  updateBilling,
  updateGeofence,
  updateGst,
  updateProfile,
  updateShiftTimes,
  updateYardCapacity,
  uploadSignatureHandler,
} from "../controllers/kiln.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";
import { uploadSignature } from "../middleware/upload.middleware";

export const kilnRouter = Router();

kilnRouter.get("/public", asyncHandler(publicKiln));

kilnRouter.use(requireAuth);
kilnRouter.get("/", asyncHandler(listKilns));
kilnRouter.post("/", asyncHandler(createKiln));
kilnRouter.patch("/geofence", resolveKiln, asyncHandler(updateGeofence));
kilnRouter.patch("/yard-capacity", resolveKiln, asyncHandler(updateYardCapacity));
kilnRouter.patch("/shift-times", resolveKiln, asyncHandler(updateShiftTimes));
kilnRouter.patch("/gst", resolveKiln, asyncHandler(updateGst));
kilnRouter.patch("/profile", resolveKiln, asyncHandler(updateProfile));
kilnRouter.patch("/billing", resolveKiln, asyncHandler(updateBilling));
kilnRouter.post("/signature", resolveKiln, uploadSignature, asyncHandler(uploadSignatureHandler));
kilnRouter.get("/signature", resolveKiln, asyncHandler(getSignature));
kilnRouter.post("/onboarding/complete", resolveKiln, asyncHandler(finishOnboarding));
