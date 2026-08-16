import { Router } from "express";
import {
  create,
  createFuelLog,
  createMaintenance,
  list,
  listFuelLogs,
  listMaintenance,
} from "../controllers/machine.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const machineRouter = Router();

machineRouter.use(requireAuth, resolveKiln);
machineRouter.post("/", asyncHandler(create));
machineRouter.get("/", asyncHandler(list));
machineRouter.post("/fuel-logs", asyncHandler(createFuelLog));
machineRouter.get("/fuel-logs", asyncHandler(listFuelLogs));
machineRouter.post("/maintenance", asyncHandler(createMaintenance));
machineRouter.get("/maintenance", asyncHandler(listMaintenance));
