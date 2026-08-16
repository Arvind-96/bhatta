import { Router } from "express";
import { create, familyForPerson, list, remove, update } from "../controllers/familyMember.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const familyMemberRouter = Router();

familyMemberRouter.use(requireAuth, resolveKiln);
familyMemberRouter.post("/", asyncHandler(create));
familyMemberRouter.get("/", asyncHandler(list));
familyMemberRouter.get("/for-person/:personId", asyncHandler(familyForPerson));
familyMemberRouter.patch("/:id", asyncHandler(update));
familyMemberRouter.delete("/:id", asyncHandler(remove));
