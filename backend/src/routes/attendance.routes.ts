import { Router } from "express";
import { faceCheckInHandler, listForDay, mark } from "../controllers/attendance.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth, resolveKiln);
attendanceRouter.post("/", asyncHandler(mark));
attendanceRouter.get("/", asyncHandler(listForDay));
attendanceRouter.post("/face-checkin", asyncHandler(faceCheckInHandler));
