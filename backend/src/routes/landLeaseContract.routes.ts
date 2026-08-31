import { Router } from "express";
import {
  create,
  expiringSoon,
  getOne,
  list,
  remove,
  update,
  updateStatus,
} from "../controllers/landLeaseContract.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const landLeaseContractRouter = Router();

landLeaseContractRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
landLeaseContractRouter.post("/", asyncHandler(create));
landLeaseContractRouter.get("/", asyncHandler(list));
landLeaseContractRouter.get("/expiring-soon", asyncHandler(expiringSoon));
landLeaseContractRouter.get("/:id", asyncHandler(getOne));
landLeaseContractRouter.patch("/:id", asyncHandler(update));
landLeaseContractRouter.patch("/:id/status", asyncHandler(updateStatus));
landLeaseContractRouter.delete("/:id", asyncHandler(remove));
