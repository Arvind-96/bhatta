import { Router } from "express";
import { create, list, detail, update } from "../controllers/expenseType.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const expenseTypeRouter = Router();

expenseTypeRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
expenseTypeRouter.post("/", asyncHandler(create));
expenseTypeRouter.get("/", asyncHandler(list));
expenseTypeRouter.get("/:id", asyncHandler(detail));
expenseTypeRouter.patch("/:id", asyncHandler(update));
