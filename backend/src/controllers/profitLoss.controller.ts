import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { profitLossStatement } from "../services/profitLoss.service";
import { istStartOfDay, istStartOfDayString, istEndOfDayString } from "../utils/istTime";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

// Defaults to the last 30 days when no explicit range is picked — same
// default window every other financial summary in this app (Financial
// Overview, seasonFinancialSummary) uses.
//
// Bug fix: explicit from/to strings used to go through a bare
// `new Date("YYYY-MM-DD")`, which parses as UTC midnight = IST 5:30am, not
// IST midnight — silently dropped most of the "to" day and shifted "from"
// 5.5 hours late. Now uses the same IST-aware day boundaries Financial
// Overview's own custom range uses.
export async function get(req: AuthedRequest, res: Response) {
  const input = querySchema.parse(req.query);
  const to = input.to ? istEndOfDayString(input.to) : undefined;
  const from = input.from
    ? istStartOfDayString(input.from)
    : istStartOfDay(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  // Bug fix: this used to pass `req.season!.id`, scoping the P&L page's
  // own admin-editable date range to only the currently-active Bhatta
  // season — a range spanning two seasons silently dropped every
  // dispatch/invoice/expense/fuel/diesel row belonging to the other
  // season. `null` = every season, same fix and same reasoning as
  // financialOverview.controller.ts's own customRange handler.
  const result = await profitLossStatement(req.kiln!.id, null, from, to);
  res.json(result);
}
