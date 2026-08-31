import { Router } from "express";
import { create, list } from "../controllers/wastage.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const wastageRouter = Router();

wastageRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
wastageRouter.post("/", asyncHandler(create));
wastageRouter.get("/", asyncHandler(list));
