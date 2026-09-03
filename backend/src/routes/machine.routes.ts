import { Router } from "express";
import {
  create,
  createFuelLog,
  createInstallment,
  createMaintenance,
  get,
  list,
  listFuelLogs,
  listInstallments,
  listMaintenance,
  remove,
  removeFuelLog,
  removeInstallment,
  removeMaintenance,
  update,
} from "../controllers/machine.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const machineRouter = Router();

machineRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
machineRouter.post("/", asyncHandler(create));
machineRouter.get("/", asyncHandler(list));
machineRouter.post("/fuel-logs", asyncHandler(createFuelLog));
machineRouter.get("/fuel-logs", asyncHandler(listFuelLogs));
machineRouter.delete("/fuel-logs/:id", asyncHandler(removeFuelLog));
machineRouter.post("/maintenance", asyncHandler(createMaintenance));
machineRouter.get("/maintenance", asyncHandler(listMaintenance));
machineRouter.delete("/maintenance/:id", asyncHandler(removeMaintenance));
machineRouter.get("/:id", asyncHandler(get));
machineRouter.patch("/:id", asyncHandler(update));
machineRouter.delete("/:id", asyncHandler(remove));
machineRouter.post("/:id/installments", asyncHandler(createInstallment));
machineRouter.get("/:id/installments", asyncHandler(listInstallments));
machineRouter.delete("/:id/installments/:paymentId", asyncHandler(removeInstallment));
