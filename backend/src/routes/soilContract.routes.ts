import { Router } from "express";
import {
  create,
  dailyMovement,
  dashboard,
  expiringSoon,
  getOne,
  list,
  remove,
  settle,
  update,
  updateStatus,
} from "../controllers/soilContract.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const soilContractRouter = Router();

soilContractRouter.use(requireAuth, resolveKiln);
soilContractRouter.post("/", asyncHandler(create));
soilContractRouter.get("/", asyncHandler(list));
soilContractRouter.get("/dashboard", asyncHandler(dashboard));
soilContractRouter.get("/expiring-soon", asyncHandler(expiringSoon));
soilContractRouter.get("/:id", asyncHandler(getOne));
soilContractRouter.get("/:id/daily-movement", asyncHandler(dailyMovement));
soilContractRouter.patch("/:id", asyncHandler(update));
soilContractRouter.patch("/:id/status", asyncHandler(updateStatus));
soilContractRouter.post("/:id/settle", asyncHandler(settle));
soilContractRouter.delete("/:id", asyncHandler(remove));
