import { Router } from "express";
import { create, list, remove, update } from "../controllers/doctorVisit.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const doctorVisitRouter = Router();

doctorVisitRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
doctorVisitRouter.post("/", asyncHandler(create));
doctorVisitRouter.get("/", asyncHandler(list));
doctorVisitRouter.patch("/:id", asyncHandler(update));
doctorVisitRouter.delete("/:id", asyncHandler(remove));
