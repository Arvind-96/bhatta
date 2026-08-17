import { Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { AuthedRequest } from "../middleware/auth.middleware";
import { db } from "../db/client";
import { kilns } from "../db/schema";
import { compareModule, COMPARE_MODULES } from "../services/compare.service";

const moduleSchema = z.enum(COMPARE_MODULES);

const yearsSchema = z
  .string()
  .transform((s) => s.split(",").map((v) => Number(v.trim())))
  .pipe(z.array(z.number().int().min(2000).max(2100)).min(1).max(6));

export async function get(req: AuthedRequest, res: Response) {
  const module = moduleSchema.parse(req.params.module);
  const seasonYears = yearsSchema.parse(req.query.years);

  const kiln = db.select({ seasonStartMonth: kilns.seasonStartMonth, seasonStartDay: kilns.seasonStartDay }).from(kilns).where(eq(kilns._id, req.kiln!.id)).get();
  const seasonSetting = {
    seasonStartMonth: kiln?.seasonStartMonth ?? 8,
    seasonStartDay: kiln?.seasonStartDay ?? 1,
  };

  const result = await compareModule(req.kiln!.id, module, seasonSetting, seasonYears);
  res.json(result);
}
