import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createJcbWorkLog, listJcbWorkLogs } from "../services/jcbWorkLog.service";

const createSchema = z.object({
  landId: z.string(),
  landownerId: z.string(),
  driverId: z.string(),
  machineId: z.string().optional(),
  contractId: z.string().optional(),
  hoursWorked: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const log = await createJcbWorkLog({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(log);
}

export async function list(req: AuthedRequest, res: Response) {
  const logs = await listJcbWorkLogs(req.kiln!.id, {
    landId: req.query.landId as string | undefined,
    driverId: req.query.driverId as string | undefined,
    contractId: req.query.contractId as string | undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json(logs);
}
