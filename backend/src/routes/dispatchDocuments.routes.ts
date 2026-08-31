import { Router } from "express";
import {
  createChallanHandler,
  listChallansHandler,
  nextChallanSequenceNumberHandler,
  updateChallanHandler,
  deleteChallanHandler,
  createGatePassHandler,
  listGatePassesHandler,
  nextGatePassSequenceNumberHandler,
  updateGatePassHandler,
  deleteGatePassHandler,
  createInvoiceHandler,
  listInvoicesHandler,
  nextInvoiceSequenceNumberHandler,
  updateInvoiceHandler,
  deleteInvoiceHandler,
} from "../controllers/dispatchDocuments.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const challanRouter = Router();
challanRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
challanRouter.post("/", asyncHandler(createChallanHandler));
challanRouter.get("/", asyncHandler(listChallansHandler));
challanRouter.get("/next-sequence-number", asyncHandler(nextChallanSequenceNumberHandler));
challanRouter.patch("/:id", asyncHandler(updateChallanHandler));
challanRouter.delete("/:id", asyncHandler(deleteChallanHandler));

export const gatePassRouter = Router();
gatePassRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
gatePassRouter.post("/", asyncHandler(createGatePassHandler));
gatePassRouter.get("/", asyncHandler(listGatePassesHandler));
gatePassRouter.get("/next-sequence-number", asyncHandler(nextGatePassSequenceNumberHandler));
gatePassRouter.patch("/:id", asyncHandler(updateGatePassHandler));
gatePassRouter.delete("/:id", asyncHandler(deleteGatePassHandler));

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
invoiceRouter.post("/", asyncHandler(createInvoiceHandler));
invoiceRouter.get("/", asyncHandler(listInvoicesHandler));
invoiceRouter.get("/next-sequence-number", asyncHandler(nextInvoiceSequenceNumberHandler));
invoiceRouter.patch("/:id", asyncHandler(updateInvoiceHandler));
invoiceRouter.delete("/:id", asyncHandler(deleteInvoiceHandler));
