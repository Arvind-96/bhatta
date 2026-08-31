import { Router } from "express";
import { create, detail, list, update } from "../controllers/bankAccount.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const bankAccountRouter = Router();

bankAccountRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
bankAccountRouter.post("/", asyncHandler(create));
bankAccountRouter.get("/", asyncHandler(list));
bankAccountRouter.get("/:id", asyncHandler(detail));
bankAccountRouter.patch("/:id", asyncHandler(update));
