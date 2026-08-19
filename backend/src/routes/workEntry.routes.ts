import { Router } from "express";
import { create, list, remove, update } from "../controllers/workEntry.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const workEntryRouter = Router();

workEntryRouter.use(requireAuth, resolveKiln);
workEntryRouter.post("/", asyncHandler(create));
workEntryRouter.get("/", asyncHandler(list));
workEntryRouter.patch("/:id", asyncHandler(update));
workEntryRouter.delete("/:id", asyncHandler(remove));
