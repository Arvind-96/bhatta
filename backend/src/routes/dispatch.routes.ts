import { Router } from "express";
import { adjustment, bySaleOrder, create, list, remove, soldByCategory, totals, update } from "../controllers/dispatch.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const dispatchRouter = Router();

dispatchRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
dispatchRouter.post("/", asyncHandler(create));
dispatchRouter.get("/", asyncHandler(list));
dispatchRouter.get("/totals", asyncHandler(totals));
dispatchRouter.get("/sold-by-category", asyncHandler(soldByCategory));
dispatchRouter.get("/by-sale-order/:saleOrderId", asyncHandler(bySaleOrder));
dispatchRouter.patch("/:id/adjustment", asyncHandler(adjustment));
dispatchRouter.patch("/:id", asyncHandler(update));
dispatchRouter.delete("/:id", asyncHandler(remove));
