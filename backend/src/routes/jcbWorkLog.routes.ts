import { Router } from "express";
import { create, list } from "../controllers/jcbWorkLog.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const jcbWorkLogRouter = Router();

jcbWorkLogRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
jcbWorkLogRouter.post("/", asyncHandler(create));
jcbWorkLogRouter.get("/", asyncHandler(list));
