import { Router } from "express";
import { create, list, remove, roster } from "../controllers/firingShift.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const firingShiftRouter = Router();

firingShiftRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
firingShiftRouter.post("/", asyncHandler(create));
firingShiftRouter.get("/", asyncHandler(list));
firingShiftRouter.get("/roster", asyncHandler(roster));
firingShiftRouter.delete("/:id", asyncHandler(remove));
