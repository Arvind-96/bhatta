import { Router } from "express";
import { create, expiringSoon, list } from "../controllers/compliance.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const complianceRouter = Router();

complianceRouter.use(requireAuth, resolveKiln);
complianceRouter.post("/", asyncHandler(create));
complianceRouter.get("/", asyncHandler(list));
complianceRouter.get("/expiring-soon", asyncHandler(expiringSoon));
