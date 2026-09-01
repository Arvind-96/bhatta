import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { profitLossStatement } from "../services/profitLoss.service";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

// Defaults to the last 30 days when no explicit range is picked — same
// default window every other financial summary in this app (Financial
// Overview, seasonFinancialSummary) uses.
export async function get(req: AuthedRequest, res: Response) {
  const input = querySchema.parse(req.query);
  const to = input.to ? new Date(input.to) : undefined;
  const from = input.from
    ? new Date(input.from)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d;
      })();
  const result = await profitLossStatement(req.kiln!.id, req.season!.id, from, to);
  res.json(result);
}
