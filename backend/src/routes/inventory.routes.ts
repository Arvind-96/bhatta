import { Router } from "express";
import { create, list, remove, update } from "../controllers/inventory.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
inventoryRouter.post("/", asyncHandler(create));
inventoryRouter.get("/", asyncHandler(list));
inventoryRouter.patch("/:id", asyncHandler(update));
inventoryRouter.delete("/:id", asyncHandler(remove));
