import { Router } from "express";
import { adjustment, create, list, totals } from "../controllers/dispatch.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const dispatchRouter = Router();

dispatchRouter.use(requireAuth, resolveKiln);
dispatchRouter.post("/", asyncHandler(create));
dispatchRouter.get("/", asyncHandler(list));
dispatchRouter.get("/totals", asyncHandler(totals));
dispatchRouter.patch("/:id/adjustment", asyncHandler(adjustment));
