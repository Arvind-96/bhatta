import { Response } from "express";
import { z } from "zod";
import {
  completeOnboarding,
  createAdditionalKiln,
  listUserKilns,
  setKilnGeofence,
  setYardCapacity,
  updateKilnProfile,
} from "../services/auth.service";
import { AuthedRequest } from "../middleware/auth.middleware";

const createKilnSchema = z.object({
  name: z.string(),
  location: z.string().optional(),
});

const geofenceSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  radiusMeters: z.number().positive().optional(),
});

const yardCapacitySchema = z.object({
  yardCapacityBricks: z.number().positive(),
});

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
});

export async function listKilns(req: AuthedRequest, res: Response) {
  const kilns = await listUserKilns(req.user!.id);
  res.json(kilns);
}

export async function createKiln(req: AuthedRequest, res: Response) {
  const input = createKilnSchema.parse(req.body);
  const kiln = await createAdditionalKiln(req.user!.id, input.name, input.location);
  res.status(201).json(kiln);
}

// Wrapped with resolveKiln at the route level so only a member of the kiln
// (its own X-Kiln-Id header) can update its geofence.
export async function updateGeofence(req: AuthedRequest, res: Response) {
  const input = geofenceSchema.parse(req.body);
  const kiln = await setKilnGeofence(req.kiln!.id, input);
  res.json(kiln);
}

export async function updateYardCapacity(req: AuthedRequest, res: Response) {
  const input = yardCapacitySchema.parse(req.body);
  const kiln = await setYardCapacity(req.kiln!.id, input.yardCapacityBricks);
  res.json(kiln);
}

export async function updateProfile(req: AuthedRequest, res: Response) {
  const input = profileSchema.parse(req.body);
  const kiln = await updateKilnProfile(req.kiln!.id, input);
  res.json(kiln);
}

export async function finishOnboarding(req: AuthedRequest, res: Response) {
  const kiln = await completeOnboarding(req.kiln!.id);
  res.json(kiln);
}
