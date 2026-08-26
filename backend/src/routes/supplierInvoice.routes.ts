import { Router } from "express";
import { create, listAll, update, remove } from "../controllers/supplierInvoice.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const supplierInvoiceRouter = Router();

supplierInvoiceRouter.use(requireAuth, resolveKiln);
supplierInvoiceRouter.post("/", asyncHandler(create));
supplierInvoiceRouter.get("/", asyncHandler(listAll));
supplierInvoiceRouter.patch("/:id", asyncHandler(update));
supplierInvoiceRouter.delete("/:id", asyncHandler(remove));
