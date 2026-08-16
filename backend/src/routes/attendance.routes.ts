import { Router } from "express";
import { forPerson, listForDay, mark, roster } from "../controllers/attendance.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth, resolveKiln);
attendanceRouter.post("/", asyncHandler(mark));
attendanceRouter.get("/", asyncHandler(listForDay));
attendanceRouter.get("/for-person/:personId", asyncHandler(forPerson));
attendanceRouter.get("/roster", asyncHandler(roster));
