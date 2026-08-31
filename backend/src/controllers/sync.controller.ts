import { Response } from "express";
import { z } from "zod";
import { applySyncPush } from "../services/sync.service";
import { AuthedRequest } from "../middleware/auth.middleware";

const pushSchema = z.object({
  changes: z.array(
    z.object({
      entityType: z.enum(["production", "stock"]),
      localId: z.string(),
      payload: z.record(z.any()),
    })
  ),
});

export async function pushSync(req: AuthedRequest, res: Response) {
  const input = pushSchema.parse(req.body);
  const results = await applySyncPush({ kilnId: req.kiln!.id, seasonId: req.season!.id, changes: input.changes });
  res.json({ applied: results.length, results });
}
