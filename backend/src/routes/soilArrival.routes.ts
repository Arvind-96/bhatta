import { Router } from "express";
import { create, list, remove, update } from "../controllers/soilArrival.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const soilArrivalRouter = Router();

soilArrivalRouter.use(requireAuth, resolveKiln);
soilArrivalRouter.post("/", asyncHandler(create));
soilArrivalRouter.get("/", asyncHandler(list));
soilArrivalRouter.patch("/:id", asyncHandler(update));
soilArrivalRouter.delete("/:id", asyncHandler(remove));
