import { Router } from "express";
import { create, list, remove, stockBalance, supplierBalances, update } from "../controllers/fuelPurchase.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const fuelPurchaseRouter = Router();

fuelPurchaseRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
fuelPurchaseRouter.post("/", asyncHandler(create));
fuelPurchaseRouter.get("/", asyncHandler(list));
fuelPurchaseRouter.get("/stock-balance", asyncHandler(stockBalance));
fuelPurchaseRouter.get("/supplier-balances", asyncHandler(supplierBalances));
fuelPurchaseRouter.patch("/:id", asyncHandler(update));
fuelPurchaseRouter.delete("/:id", asyncHandler(remove));
