import { Router } from "express";
import { createProduction, listProductionSeries, listTodayProduction } from "../controllers/production.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const productionRouter = Router();

productionRouter.use(requireAuth, resolveKiln);
productionRouter.post("/", asyncHandler(createProduction));
productionRouter.get("/today", asyncHandler(listTodayProduction));
productionRouter.get("/series", asyncHandler(listProductionSeries));
