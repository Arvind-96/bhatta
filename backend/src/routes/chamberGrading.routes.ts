import { Router } from "express";
import { create, list } from "../controllers/chamberGrading.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const chamberGradingRouter = Router();

chamberGradingRouter.use(requireAuth, resolveKiln);
chamberGradingRouter.post("/", asyncHandler(create));
chamberGradingRouter.get("/", asyncHandler(list));
