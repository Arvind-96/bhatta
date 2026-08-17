import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { compareModule, COMPARE_MODULES } from "../services/compare.service";

const moduleSchema = z.enum(COMPARE_MODULES);

// "YYYY-MM-DD" only (what a native <input type="date"> sends) — parsed by
// hand into LOCAL midnight/end-of-day, the same convention every other
// day-bucketed query in this codebase already uses (see
// dispatch.service.ts's startOfDay/endOfDay). Going through `new
// Date("YYYY-MM-DD")` instead would anchor the string at UTC midnight,
// which drifts onto the wrong local calendar day depending on the
// server's timezone offset — a bug already hit and fixed once this
// session for the season-boundary math this replaces.
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

function parseLocalDayStart(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function parseLocalDayEnd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

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
    { from: parseLocalDayStart(fromA), to: parseLocalDayEnd(toA) },
    { from: parseLocalDayStart(fromB), to: parseLocalDayEnd(toB) },
  ]);
  res.json(result);
}
