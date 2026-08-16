import { Router } from "express";
import { create, list } from "../controllers/stockAudit.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const stockAuditRouter = Router();

stockAuditRouter.use(requireAuth, resolveKiln);
stockAuditRouter.post("/", asyncHandler(create));
stockAuditRouter.get("/", asyncHandler(list));
