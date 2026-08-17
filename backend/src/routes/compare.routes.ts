import { Router } from "express";
import { get } from "../controllers/compare.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const compareRouter = Router();

compareRouter.use(requireAuth, resolveKiln);
compareRouter.get("/:module", asyncHandler(get));
