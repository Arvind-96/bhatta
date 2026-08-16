import { Response } from "express";
import { z } from "zod";
import {
  completeOnboarding,
  createAdditionalKiln,
  defaultKilnPublicInfo,
  listUserKilns,
  setKilnGeofence,
  setSeason,
  setShiftTimes,
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

// A fixed non-leap reference year — this is a recurring annual anchor day,
// not a specific calendar date, so Feb always caps at 28.
function daysInMonth(month: number) {
  return new Date(2023, month, 0).getDate();
}

const seasonSchema = z
  .object({
    seasonStartMonth: z.number().int().min(1).max(12),
    seasonStartDay: z.number().int().min(1).max(31),
  })
  .refine((data) => data.seasonStartDay <= daysInMonth(data.seasonStartMonth), {
    message: "seasonStartDay is not valid for the selected seasonStartMonth",
    path: ["seasonStartDay"],
  });

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const shiftTimesSchema = z.object({
  dayShiftStart: z.string().regex(TIME_REGEX, "must be HH:MM (24-hour)"),
  dayShiftEnd: z.string().regex(TIME_REGEX, "must be HH:MM (24-hour)"),
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

// Unauthenticated — this is how the frontend finds its kiln with no login
// flow to hand it one. Mirrors a login response's `kilns[0]` shape so it
// can be dropped straight into the auth store.
export async function publicKiln(_req: AuthedRequest, res: Response) {
  const kiln = await defaultKilnPublicInfo();
  res.json(kiln);
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

export async function updateSeason(req: AuthedRequest, res: Response) {
  const input = seasonSchema.parse(req.body);
  const kiln = await setSeason(req.kiln!.id, input.seasonStartMonth, input.seasonStartDay);
  res.json(kiln);
}

export async function updateShiftTimes(req: AuthedRequest, res: Response) {
  const input = shiftTimesSchema.parse(req.body);
  const kiln = await setShiftTimes(req.kiln!.id, input.dayShiftStart, input.dayShiftEnd);
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
