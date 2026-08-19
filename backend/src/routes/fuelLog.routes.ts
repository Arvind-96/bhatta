import { Router } from "express";
import { create, efficiency, list, periodTotals, remove, update } from "../controllers/fuelLog.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const fuelLogRouter = Router();

fuelLogRouter.use(requireAuth, resolveKiln);
fuelLogRouter.post("/", asyncHandler(create));
fuelLogRouter.get("/", asyncHandler(list));
fuelLogRouter.get("/efficiency", asyncHandler(efficiency));
fuelLogRouter.get("/period-totals", asyncHandler(periodTotals));
fuelLogRouter.patch("/:id", asyncHandler(update));
fuelLogRouter.delete("/:id", asyncHandler(remove));
