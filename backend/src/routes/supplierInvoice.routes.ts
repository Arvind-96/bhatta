import { Router } from "express";
import { byPurchaseOrder, create, listAll, update, remove } from "../controllers/supplierInvoice.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const supplierInvoiceRouter = Router();

supplierInvoiceRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
supplierInvoiceRouter.post("/", asyncHandler(create));
supplierInvoiceRouter.get("/", asyncHandler(listAll));
supplierInvoiceRouter.get("/by-purchase-order/:purchaseOrderId", asyncHandler(byPurchaseOrder));
supplierInvoiceRouter.patch("/:id", asyncHandler(update));
supplierInvoiceRouter.delete("/:id", asyncHandler(remove));
