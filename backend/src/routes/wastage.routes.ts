import { Router } from "express";
import { create, list } from "../controllers/wastage.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const wastageRouter = Router();

wastageRouter.use(requireAuth, resolveKiln);
wastageRouter.post("/", asyncHandler(create));
wastageRouter.get("/", asyncHandler(list));
