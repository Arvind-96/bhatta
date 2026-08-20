import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { getActiveSession, saveActiveSession, startNewSession } from "../services/labourSession.service";

const sessionSchema = z.object({
  numberOfLaborers: z.number().int().nonnegative(),
  farePerLaborer: z.number().nonnegative(),
  advancePerLaborer: z.number().nonnegative(),
});

export async function get(req: AuthedRequest, res: Response) {
  const result = await getActiveSession(req.kiln!.id, req.params.contractorId);
  res.json(result);
}

export async function save(req: AuthedRequest, res: Response) {
  const input = sessionSchema.parse(req.body);
  const result = await saveActiveSession(req.kiln!.id, req.params.contractorId, input);
  res.json(result);
}

export async function startNew(req: AuthedRequest, res: Response) {
  const input = sessionSchema.parse(req.body);
  const result = await startNewSession(req.kiln!.id, req.params.contractorId, input);
  res.json(result);
}
