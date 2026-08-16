import { Router } from "express";
import { downloadPdf, forPerson, generate, status } from "../controllers/salary.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const salaryRouter = Router();

salaryRouter.use(requireAuth, resolveKiln);
salaryRouter.get("/", asyncHandler(status));
salaryRouter.post("/generate", asyncHandler(generate));
salaryRouter.get("/for-person/:personId", asyncHandler(forPerson));
salaryRouter.get("/:slipId/pdf", asyncHandler(downloadPdf));
