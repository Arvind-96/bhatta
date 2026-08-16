import { Router } from "express";
import { create, driverSummary, list, update } from "../controllers/brickLoading.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const brickLoadingRouter = Router();

brickLoadingRouter.use(requireAuth, resolveKiln);
brickLoadingRouter.post("/", asyncHandler(create));
brickLoadingRouter.get("/", asyncHandler(list));
brickLoadingRouter.get("/driver-summary", asyncHandler(driverSummary));
brickLoadingRouter.patch("/:id", asyncHandler(update));
