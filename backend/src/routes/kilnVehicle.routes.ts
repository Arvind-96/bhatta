import { Router } from "express";
import {
  createDieselHandler,
  createVehicleHandler,
  dieselPeriodTotalsHandler,
  listDieselHandler,
  listVehiclesHandler,
  removeDieselHandler,
  removeVehicleHandler,
} from "../controllers/kilnVehicle.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const kilnVehicleRouter = Router();

kilnVehicleRouter.use(requireAuth, resolveKiln);

kilnVehicleRouter.post("/", asyncHandler(createVehicleHandler));
kilnVehicleRouter.get("/", asyncHandler(listVehiclesHandler));
kilnVehicleRouter.delete("/:id", asyncHandler(removeVehicleHandler));

kilnVehicleRouter.post("/diesel", asyncHandler(createDieselHandler));
kilnVehicleRouter.get("/diesel", asyncHandler(listDieselHandler));
kilnVehicleRouter.get("/diesel/period-totals", asyncHandler(dieselPeriodTotalsHandler));
kilnVehicleRouter.delete("/diesel/:id", asyncHandler(removeDieselHandler));
