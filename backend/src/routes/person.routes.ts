import { Router } from "express";
import {
  addLedger,
  advances,
  create,
  creditAging,
  getOne,
  list,
  listLedger,
  paymentsDue,
  report,
  update,
} from "../controllers/person.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const personRouter = Router();

personRouter.use(requireAuth, resolveKiln);
personRouter.post("/", asyncHandler(create));
personRouter.get("/", asyncHandler(list));
personRouter.get("/advances", asyncHandler(advances));
personRouter.get("/payments-due", asyncHandler(paymentsDue));
personRouter.get("/credit-aging", asyncHandler(creditAging));
personRouter.get("/:id", asyncHandler(getOne));
personRouter.patch("/:id", asyncHandler(update));
personRouter.post("/:id/ledger", asyncHandler(addLedger));
personRouter.get("/:id/ledger", asyncHandler(listLedger));
personRouter.get("/:id/report", asyncHandler(report));
