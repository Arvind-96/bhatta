import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { financialOverview, financialOverviewCustomRange } from "../services/financialOverview.service";
import { istStartOfDayString, istEndOfDayString } from "../utils/istTime";

export async function get(req: AuthedRequest, res: Response) {
  const result = await financialOverview(req.kiln!.id, req.season!.id);
  res.json(result);
}

const customRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export async function customRange(req: AuthedRequest, res: Response) {
  const input = customRangeSchema.parse(req.query);
  // Bug fix (date parsing): `new Date("YYYY-MM-DD")` parses as UTC midnight
  // = IST 5:30am, not IST midnight — silently dropped most of the "to" day
  // and shifted "from" 5.5 hours late. Use the IST-aware day boundaries
  // instead, same convention financialOverview()'s own today/week/month/
  // year buckets use.
  //
  // Bug fix (season scoping): this used to pass `req.season!.id`, scoping
  // a custom range to only the currently-active Bhatta season — a range
  // spanning two seasons silently dropped every dispatch/invoice/expense/
  // fuel/diesel row belonging to the other season, even though it falls
  // inside the picked dates. `null` means "every season" here, same as
  // compare.service.ts's own documented convention for exactly this
  // reason (an admin-picked custom range isn't bounded by the season the
  // kiln happens to currently be in).
  const result = await financialOverviewCustomRange(req.kiln!.id, null, istStartOfDayString(input.from), istEndOfDayString(input.to));
  res.json(result);
}
