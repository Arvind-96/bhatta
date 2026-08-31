import { Router } from "express";
import { create, list } from "../controllers/season.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const seasonRouter = Router();

// Deliberately no resolveSeason/blockWritesOnArchivedSeason here — seasons
// themselves are a kiln-level administrative concept, not season-scoped
// data. Starting a new season must always be possible regardless of which
// season the requesting client currently has selected.
seasonRouter.use(requireAuth, resolveKiln);
seasonRouter.get("/", asyncHandler(list));
seasonRouter.post("/", asyncHandler(create));
