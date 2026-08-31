import { Router } from "express";
import { cancel, create, detail, fulfill, list, update } from "../controllers/purchaseOrder.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const purchaseOrderRouter = Router();

purchaseOrderRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
purchaseOrderRouter.post("/", asyncHandler(create));
purchaseOrderRouter.get("/", asyncHandler(list));
purchaseOrderRouter.get("/:id", asyncHandler(detail));
purchaseOrderRouter.patch("/:id", asyncHandler(update));
purchaseOrderRouter.post("/:id/cancel", asyncHandler(cancel));
purchaseOrderRouter.post("/:id/fulfill", asyncHandler(fulfill));
