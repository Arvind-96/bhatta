import { Router } from "express";
import { create, list } from "../controllers/loadingEntry.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const loadingEntryRouter = Router();

loadingEntryRouter.use(requireAuth, resolveKiln);
loadingEntryRouter.post("/", asyncHandler(create));
loadingEntryRouter.get("/", asyncHandler(list));
