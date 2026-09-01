import { Router } from "express";
import { create, list, remove, update } from "../controllers/doctor.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const doctorRouter = Router();

doctorRouter.use(requireAuth, resolveKiln);
doctorRouter.post("/", asyncHandler(create));
doctorRouter.get("/", asyncHandler(list));
doctorRouter.patch("/:id", asyncHandler(update));
doctorRouter.delete("/:id", asyncHandler(remove));
