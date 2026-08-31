import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createSoilTrip, listSoilTrips, soilInwardTotals, updateSoilTripStatus } from "../services/soilTrip.service";

const createSchema = z.object({
  landownerId: z.string(),
  driverId: z.string().optional(),
  contractId: z.string().optional(),
  landId: z.string().optional(),
  siteId: z.string().optional(),
  tractorNumber: z.string().optional(),
  trolleyCount: z.number().int().positive().optional(),
  receivedTrolleyCount: z.number().int().positive().optional(),
  // nonnegative, not positive — a trip against a PER_BIGHA/PER_DEPTH
  // contract sends 0 here since that soil's price was already charged as a
  // lump sum when the contract was created (see soilTrip.service.ts).
  ratePerTrolley: z.number().nonnegative(),
  driverRatePerTrolley: z.number().positive().optional(),
  depthFeet: z.number().positive().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const trip = await createSoilTrip({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(trip);
}

export async function list(req: AuthedRequest, res: Response) {
  const trips = await listSoilTrips(req.kiln!.id, req.season!.id, {
    landownerId: req.query.landownerId as string | undefined,
    contractId: req.query.contractId as string | undefined,
    landId: req.query.landId as string | undefined,
    siteId: req.query.siteId as string | undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json(trips);
}

const statusSchema = z.object({ status: z.enum(["ARRIVED", "WEATHERING", "READY"]) });

export async function updateStatus(req: AuthedRequest, res: Response) {
  const input = statusSchema.parse(req.body);
  const trip = await updateSoilTripStatus(req.kiln!.id, req.params.id, input.status);
  res.json(trip);
}

export async function totals(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await soilInwardTotals(req.kiln!.id, req.season!.id, days);
  res.json(result);
}
