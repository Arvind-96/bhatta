import { Router } from "express";
import { create, list, detail, update, remove } from "../controllers/customer.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const customerRouter = Router();

customerRouter.use(requireAuth, resolveKiln);
customerRouter.post("/", asyncHandler(create));
customerRouter.get("/", asyncHandler(list));
customerRouter.get("/:id", asyncHandler(detail));
customerRouter.patch("/:id", asyncHandler(update));
customerRouter.delete("/:id", asyncHandler(remove));
