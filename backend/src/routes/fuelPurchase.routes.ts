import { Router } from "express";
import { create, list, stockBalance, supplierBalances } from "../controllers/fuelPurchase.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const fuelPurchaseRouter = Router();

fuelPurchaseRouter.use(requireAuth, resolveKiln);
fuelPurchaseRouter.post("/", asyncHandler(create));
fuelPurchaseRouter.get("/", asyncHandler(list));
fuelPurchaseRouter.get("/stock-balance", asyncHandler(stockBalance));
fuelPurchaseRouter.get("/supplier-balances", asyncHandler(supplierBalances));
