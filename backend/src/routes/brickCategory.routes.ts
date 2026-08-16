import { Router } from "express";
import {
  createCategory,
  createLoading,
  createProduction,
  listCategories,
  listLoading,
  listProduction,
  removeCategory,
  removeLoading,
  removeProduction,
  updateCategoryQuantity,
} from "../controllers/brickCategory.controller";
import { requireAuth, resolveKiln } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/asyncHandler";

export const brickCategoryRouter = Router();

brickCategoryRouter.use(requireAuth, resolveKiln);

brickCategoryRouter.post("/", asyncHandler(createCategory));
brickCategoryRouter.get("/", asyncHandler(listCategories));
brickCategoryRouter.patch("/:id", asyncHandler(updateCategoryQuantity));
brickCategoryRouter.delete("/:id", asyncHandler(removeCategory));

brickCategoryRouter.post("/production", asyncHandler(createProduction));
brickCategoryRouter.get("/production", asyncHandler(listProduction));
brickCategoryRouter.delete("/production/:id", asyncHandler(removeProduction));

brickCategoryRouter.post("/loading", asyncHandler(createLoading));
brickCategoryRouter.get("/loading", asyncHandler(listLoading));
brickCategoryRouter.delete("/loading/:id", asyncHandler(removeLoading));
