import { Router } from "express";
import { createStockEntry, listStockSnapshot } from "../controllers/stock.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const stockRouter = Router();

stockRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
stockRouter.post("/", asyncHandler(createStockEntry));
stockRouter.get("/snapshot", asyncHandler(listStockSnapshot));
