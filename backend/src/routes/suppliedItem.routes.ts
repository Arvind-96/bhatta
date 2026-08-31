import { Router } from "express";
import { create, list, remove } from "../controllers/suppliedItem.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const suppliedItemRouter = Router();

suppliedItemRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
suppliedItemRouter.post("/", asyncHandler(create));
suppliedItemRouter.get("/", asyncHandler(list));
suppliedItemRouter.delete("/:id", asyncHandler(remove));
