import { Router } from "express";
import {
  createDieselHandler,
  createVehicleHandler,
  dieselPeriodTotalsHandler,
  listDieselHandler,
  listVehiclesHandler,
  removeDieselHandler,
  removeVehicleHandler,
  updateDieselHandler,
} from "../controllers/kilnVehicle.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const kilnVehicleRouter = Router();

kilnVehicleRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);

kilnVehicleRouter.post("/", asyncHandler(createVehicleHandler));
kilnVehicleRouter.get("/", asyncHandler(listVehiclesHandler));
kilnVehicleRouter.delete("/:id", asyncHandler(removeVehicleHandler));

kilnVehicleRouter.post("/diesel", asyncHandler(createDieselHandler));
kilnVehicleRouter.get("/diesel", asyncHandler(listDieselHandler));
kilnVehicleRouter.get("/diesel/period-totals", asyncHandler(dieselPeriodTotalsHandler));
kilnVehicleRouter.patch("/diesel/:id", asyncHandler(updateDieselHandler));
kilnVehicleRouter.delete("/diesel/:id", asyncHandler(removeDieselHandler));
