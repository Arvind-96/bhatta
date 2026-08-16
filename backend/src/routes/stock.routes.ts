import { Router } from "express";
import { createStockEntry, listStockSnapshot } from "../controllers/stock.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const stockRouter = Router();

stockRouter.use(requireAuth, resolveKiln);
stockRouter.post("/", asyncHandler(createStockEntry));
stockRouter.get("/snapshot", asyncHandler(listStockSnapshot));
