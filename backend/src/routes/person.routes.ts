import { Router } from "express";
import {
  addLedger,
  advances,
  contractorBalance,
  create,
  creditAging,
  getIdentityProof,
  getOne,
  getPhoto,
  list,
  listLedger,
  merge,
  paymentsDue,
  report,
  update,
  uploadIdentityProof as uploadIdentityProofHandler,
  uploadPhoto as uploadPhotoHandler,
} from "../controllers/person.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";
import { uploadPhoto, uploadIdentityProof } from "../middleware/upload.middleware";

export const personRouter = Router();

personRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
personRouter.post("/", asyncHandler(create));
personRouter.get("/", asyncHandler(list));
personRouter.get("/advances", asyncHandler(advances));
personRouter.get("/payments-due", asyncHandler(paymentsDue));
personRouter.get("/credit-aging", asyncHandler(creditAging));
personRouter.get("/:id", asyncHandler(getOne));
personRouter.patch("/:id", asyncHandler(update));
personRouter.post("/:id/ledger", asyncHandler(addLedger));
personRouter.get("/:id/ledger", asyncHandler(listLedger));
personRouter.get("/:id/contractor-balance", asyncHandler(contractorBalance));
personRouter.get("/:id/report", asyncHandler(report));
personRouter.post("/:id/merge-into", asyncHandler(merge));
personRouter.post("/:id/photo", uploadPhoto, asyncHandler(uploadPhotoHandler));
personRouter.get("/:id/photo", asyncHandler(getPhoto));
personRouter.post("/:id/identity-proof", uploadIdentityProof, asyncHandler(uploadIdentityProofHandler));
personRouter.get("/:id/identity-proof", asyncHandler(getIdentityProof));
