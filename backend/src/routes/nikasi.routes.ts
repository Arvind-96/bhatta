import { Router } from "express";
import { contractorSummary, create, list, operatorSummary, periodTotals, remove, update } from "../controllers/nikasi.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const nikasiRouter = Router();

nikasiRouter.use(requireAuth, resolveKiln);
nikasiRouter.post("/", asyncHandler(create));
nikasiRouter.get("/", asyncHandler(list));
nikasiRouter.get("/operator-summary", asyncHandler(operatorSummary));
nikasiRouter.get("/contractor-summary", asyncHandler(contractorSummary));
nikasiRouter.get("/period-totals", asyncHandler(periodTotals));
nikasiRouter.patch("/:id", asyncHandler(update));
nikasiRouter.delete("/:id", asyncHandler(remove));
