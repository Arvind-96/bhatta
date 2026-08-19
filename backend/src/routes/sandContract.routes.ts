import { Router } from "express";
import { create, list, remove, update } from "../controllers/sandContract.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const sandContractRouter = Router();

sandContractRouter.use(requireAuth, resolveKiln);
sandContractRouter.post("/", asyncHandler(create));
sandContractRouter.get("/", asyncHandler(list));
sandContractRouter.patch("/:id", asyncHandler(update));
sandContractRouter.delete("/:id", asyncHandler(remove));
