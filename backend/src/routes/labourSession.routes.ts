import { Router } from "express";
import { get, save, startNew } from "../controllers/labourSession.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const labourSessionRouter = Router();

labourSessionRouter.use(requireAuth, resolveKiln);
labourSessionRouter.get("/:contractorId", asyncHandler(get));
labourSessionRouter.patch("/:contractorId", asyncHandler(save));
labourSessionRouter.post("/:contractorId/start-new", asyncHandler(startNew));
