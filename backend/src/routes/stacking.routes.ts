import { Router } from "express";
import { contractorSummary, create, list, operatorSummary, tractorFleet, update } from "../controllers/stacking.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const stackingRouter = Router();

stackingRouter.use(requireAuth, resolveKiln);
stackingRouter.post("/", asyncHandler(create));
stackingRouter.get("/", asyncHandler(list));
stackingRouter.get("/operator-summary", asyncHandler(operatorSummary));
stackingRouter.get("/contractor-summary", asyncHandler(contractorSummary));
stackingRouter.get("/tractor-fleet", asyncHandler(tractorFleet));
stackingRouter.patch("/:id", asyncHandler(update));
