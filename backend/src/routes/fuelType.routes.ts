import { Router } from "express";
import { create, list, remove } from "../controllers/fuelType.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const fuelTypeRouter = Router();

fuelTypeRouter.use(requireAuth, resolveKiln);
fuelTypeRouter.post("/", asyncHandler(create));
fuelTypeRouter.get("/", asyncHandler(list));
fuelTypeRouter.delete("/:id", asyncHandler(remove));
