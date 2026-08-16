import { Router } from "express";
import { create, getOne, list, remove, update } from "../controllers/paymentReceipt.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const paymentReceiptRouter = Router();

paymentReceiptRouter.use(requireAuth, resolveKiln);
paymentReceiptRouter.post("/", asyncHandler(create));
paymentReceiptRouter.get("/", asyncHandler(list));
paymentReceiptRouter.get("/:id", asyncHandler(getOne));
paymentReceiptRouter.patch("/:id", asyncHandler(update));
paymentReceiptRouter.delete("/:id", asyncHandler(remove));
