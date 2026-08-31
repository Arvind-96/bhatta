import { Router } from "express";
import { create, list, overview, update } from "../controllers/pathaiSite.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const pathaiSiteRouter = Router();

pathaiSiteRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
pathaiSiteRouter.post("/", asyncHandler(create));
pathaiSiteRouter.get("/", asyncHandler(list));
pathaiSiteRouter.get("/overview", asyncHandler(overview));
pathaiSiteRouter.patch("/:id", asyncHandler(update));
