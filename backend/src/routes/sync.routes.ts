import { Router } from "express";
import { pushSync } from "../controllers/sync.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const syncRouter = Router();

syncRouter.use(requireAuth, resolveKiln);
syncRouter.post("/push", asyncHandler(pushSync));
