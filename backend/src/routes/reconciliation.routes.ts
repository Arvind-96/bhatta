import { Router } from "express";
import { dashboardStock, finishedGoods, get } from "../controllers/reconciliation.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const reconciliationRouter = Router();

reconciliationRouter.use(requireAuth, resolveKiln);
reconciliationRouter.get("/", asyncHandler(get));
reconciliationRouter.get("/finished-goods", asyncHandler(finishedGoods));
reconciliationRouter.get("/dashboard-stock", asyncHandler(dashboardStock));
