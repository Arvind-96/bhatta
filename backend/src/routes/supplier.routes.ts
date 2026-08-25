import { Router } from "express";
import { create, list, update, remove } from "../controllers/supplier.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const supplierRouter = Router();

supplierRouter.use(requireAuth, resolveKiln);
supplierRouter.post("/", asyncHandler(create));
supplierRouter.get("/", asyncHandler(list));
supplierRouter.patch("/:id", asyncHandler(update));
supplierRouter.delete("/:id", asyncHandler(remove));
