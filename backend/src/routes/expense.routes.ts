import { Router } from "express";
import { create, list, totals } from "../controllers/expense.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const expenseRouter = Router();

expenseRouter.use(requireAuth, resolveKiln);
expenseRouter.post("/", asyncHandler(create));
expenseRouter.get("/", asyncHandler(list));
expenseRouter.get("/totals", asyncHandler(totals));
