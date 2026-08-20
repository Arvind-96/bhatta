import { Router } from "express";
import {
  createChallanHandler,
  listChallansHandler,
  updateChallanHandler,
  deleteChallanHandler,
  createGatePassHandler,
  listGatePassesHandler,
  updateGatePassHandler,
  deleteGatePassHandler,
  createInvoiceHandler,
  listInvoicesHandler,
  updateInvoiceHandler,
  deleteInvoiceHandler,
} from "../controllers/dispatchDocuments.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const challanRouter = Router();
challanRouter.use(requireAuth, resolveKiln);
challanRouter.post("/", asyncHandler(createChallanHandler));
challanRouter.get("/", asyncHandler(listChallansHandler));
challanRouter.patch("/:id", asyncHandler(updateChallanHandler));
challanRouter.delete("/:id", asyncHandler(deleteChallanHandler));

export const gatePassRouter = Router();
gatePassRouter.use(requireAuth, resolveKiln);
gatePassRouter.post("/", asyncHandler(createGatePassHandler));
gatePassRouter.get("/", asyncHandler(listGatePassesHandler));
gatePassRouter.patch("/:id", asyncHandler(updateGatePassHandler));
gatePassRouter.delete("/:id", asyncHandler(deleteGatePassHandler));

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth, resolveKiln);
invoiceRouter.post("/", asyncHandler(createInvoiceHandler));
invoiceRouter.get("/", asyncHandler(listInvoicesHandler));
invoiceRouter.patch("/:id", asyncHandler(updateInvoiceHandler));
invoiceRouter.delete("/:id", asyncHandler(deleteInvoiceHandler));
