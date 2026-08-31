import { Router } from "express";
import { bulkCreate, create, list, match, summary, unmatch, unmatchedBookEntries } from "../controllers/bankTransaction.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const bankTransactionRouter = Router();

bankTransactionRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
bankTransactionRouter.post("/", asyncHandler(create));
bankTransactionRouter.post("/bulk", asyncHandler(bulkCreate));
bankTransactionRouter.get("/", asyncHandler(list));
bankTransactionRouter.get("/unmatched-book-entries", asyncHandler(unmatchedBookEntries));
bankTransactionRouter.get("/summary", asyncHandler(summary));
bankTransactionRouter.post("/:id/match", asyncHandler(match));
bankTransactionRouter.post("/:id/unmatch", asyncHandler(unmatch));
