import { Router } from "express";
import { create, list, remove, update } from "../controllers/sandDelivery.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const sandDeliveryRouter = Router();

sandDeliveryRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
sandDeliveryRouter.post("/", asyncHandler(create));
sandDeliveryRouter.get("/", asyncHandler(list));
sandDeliveryRouter.patch("/:id", asyncHandler(update));
sandDeliveryRouter.delete("/:id", asyncHandler(remove));
