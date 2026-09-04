import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { compareModule, COMPARE_MODULES } from "../services/compare.service";
import { istStartOfDayString, istEndOfDayString } from "../utils/istTime";

const moduleSchema = z.enum(COMPARE_MODULES);

// "YYYY-MM-DD" only (what a native <input type="date"> sends).
//
// Bug fix: this used to parse the string into SERVER-local midnight/
// end-of-day (`new Date(y, m-1, d)`), reasoning that avoided the
// UTC-midnight pitfall of `new Date("YYYY-MM-DD")` — but the VPS itself
// may run in any timezone (currently UTC, per financialOverview.service.ts's
// own istStartOfDay comment), so "server-local" still isn't IST: entries
// between IST midnight and 5:30am on the range's start day were wrongly
// excluded, and the same window the day after the range's end was wrongly
// included. Now uses the same IST-aware boundary helpers Financial
// Overview/Profit & Loss use, so all three agree.
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// Two admin-picked calendar ranges (Compare's "Season A"/"Season B" date
// pickers) — no longer constrained to the kiln's Aug1-Jul31 season
// boundary, so the admin can compare any two arbitrary periods.
const rangeQuerySchema = z
  .object({ fromA: dateOnly, toA: dateOnly, fromB: dateOnly, toB: dateOnly })
  .refine((q) => q.fromA <= q.toA, { message: "fromA must be on or before toA", path: ["fromA"] })
  .refine((q) => q.fromB <= q.toB, { message: "fromB must be on or before toB", path: ["fromB"] });

export async function get(req: AuthedRequest, res: Response) {
  const module = moduleSchema.parse(req.params.module);
  const { fromA, toA, fromB, toB } = rangeQuerySchema.parse(req.query);

  const result = await compareModule(req.kiln!.id, module, [
    { from: istStartOfDayString(fromA), to: istEndOfDayString(toA) },
    { from: istStartOfDayString(fromB), to: istEndOfDayString(toB) },
  ]);
  res.json(result);
}
