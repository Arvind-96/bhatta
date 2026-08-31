import { Router } from "express";
import { cancel, create, detail, fulfill, list, update } from "../controllers/saleOrder.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const saleOrderRouter = Router();

saleOrderRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
saleOrderRouter.post("/", asyncHandler(create));
saleOrderRouter.get("/", asyncHandler(list));
saleOrderRouter.get("/:id", asyncHandler(detail));
saleOrderRouter.patch("/:id", asyncHandler(update));
saleOrderRouter.post("/:id/cancel", asyncHandler(cancel));
saleOrderRouter.post("/:id/fulfill", asyncHandler(fulfill));
