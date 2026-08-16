import { Router } from "express";
import { create, list, roster } from "../controllers/firingShift.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const firingShiftRouter = Router();

firingShiftRouter.use(requireAuth, resolveKiln);
firingShiftRouter.post("/", asyncHandler(create));
firingShiftRouter.get("/", asyncHandler(list));
firingShiftRouter.get("/roster", asyncHandler(roster));
