import { Router } from "express";
import { create, getOne, list, update } from "../controllers/land.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const landRouter = Router();

landRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
landRouter.post("/", asyncHandler(create));
landRouter.get("/", asyncHandler(list));
landRouter.get("/:id", asyncHandler(getOne));
landRouter.patch("/:id", asyncHandler(update));
