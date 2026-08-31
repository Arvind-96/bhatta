import { Router } from "express";
import { remove, update } from "../controllers/ledger.controller";
import { requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

// Ledger entries are created/listed under /people/:id/ledger (see
// person.routes.ts) since they're always scoped to a person there — but
// editing/deleting an existing entry only needs its own _id, so those two
// operations live here instead of adding an unrelated :personId segment.
export const ledgerRouter = Router();

ledgerRouter.use(requireAuth, resolveKiln, resolveSeason, blockWritesOnArchivedSeason);
ledgerRouter.patch("/:id", asyncHandler(update));
ledgerRouter.delete("/:id", asyncHandler(remove));
