import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { financialOverview, financialOverviewCustomRange } from "../services/financialOverview.service";

export async function get(req: AuthedRequest, res: Response) {
  const result = await financialOverview(req.kiln!.id);
  res.json(result);
}

const customRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export async function customRange(req: AuthedRequest, res: Response) {
  const input = customRangeSchema.parse(req.query);
  const result = await financialOverviewCustomRange(req.kiln!.id, new Date(input.from), new Date(input.to));
  res.json(result);
}
