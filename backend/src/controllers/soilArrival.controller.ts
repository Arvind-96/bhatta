import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createSoilArrival, deleteSoilArrival, listSoilArrivals, updateSoilArrival } from "../services/soilArrival.service";

const tractorEntrySchema = z.object({
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  tractorNumber: z.string().optional(),
});

const createSchema = z.object({
  landownerId: z.string(),
  contractId: z.string().optional(),
  jcbUsed: z.boolean().optional(),
  tractorUsed: z.boolean().optional(),
  jcbDriverId: z.string().optional(),
  tractorDriverId: z.string().optional(),
  tractors: z.array(tractorEntrySchema).optional(),
  trolleyCount: z.number().positive(),
  depthFeet: z.number().positive().optional(),
  siteId: z.string().optional(),
  paymentGiven: z.number().min(0).optional(),
  paymentPending: z.number().min(0).optional(),
  soilRemaining: z.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createSoilArrival({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const entries = await listSoilArrivals(req.kiln!.id, req.season!.id, {
    landownerId: req.query.landownerId as string | undefined,
    contractId: req.query.contractId as string | undefined,
    siteId: req.query.siteId as string | undefined,
  });
  res.json(entries);
}

const updateSchema = z.object({
  contractId: z.string().optional(),
  jcbUsed: z.boolean().optional(),
  tractorUsed: z.boolean().optional(),
  jcbDriverId: z.string().optional(),
  tractorDriverId: z.string().optional(),
  tractors: z.array(tractorEntrySchema).optional(),
  trolleyCount: z.number().positive().optional(),
  depthFeet: z.number().positive().optional(),
  siteId: z.string().optional(),
  paymentGiven: z.number().min(0).optional(),
  paymentPending: z.number().min(0).optional(),
  soilRemaining: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateSoilArrival(req.kiln!.id, req.params.id, input);
  res.json(entry);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSoilArrival(req.kiln!.id, req.params.id);
  res.status(204).end();
}
