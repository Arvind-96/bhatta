import { Router } from "express";
import { downloadPdf, forPerson, generate, generateForPerson, removeSlip, status, updateSlip } from "../controllers/salary.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const salaryRouter = Router();

salaryRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
salaryRouter.get("/", asyncHandler(status));
salaryRouter.post("/generate", asyncHandler(generate));
salaryRouter.post("/generate/:personId", asyncHandler(generateForPerson));
salaryRouter.get("/for-person/:personId", asyncHandler(forPerson));
salaryRouter.get("/:slipId/pdf", asyncHandler(downloadPdf));
salaryRouter.patch("/:slipId", asyncHandler(updateSlip));
salaryRouter.delete("/:slipId", asyncHandler(removeSlip));
