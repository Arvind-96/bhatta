import { randomUUID } from "crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { attendances, people, kilns } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";
import { euclideanDistance, haversineDistanceMeters } from "../utils/geo";

// face-api.js descriptors: a match is typically < 0.5-0.6 euclidean distance
// between two faces; this threshold trades a few false rejections (worker
// scans again) for near-zero false accepts (wrong person credited).
const FACE_MATCH_THRESHOLD = 0.5;

export interface MarkAttendanceInput {
  kilnId: string;
  personId: string;
  date: Date;
  status: "PRESENT" | "ABSENT" | "HALF_DAY";
  wageAmount?: number;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function markAttendance(input: MarkAttendanceInput) {
  await assertPersonOfType(input.kilnId, input.personId, ["WORKER", "HELPER"]);
  const day = startOfDay(input.date);

  const existing = db
    .select()
    .from(attendances)
    .where(and(eq(attendances.personId, input.personId), eq(attendances.date, day)))
    .get();

  if (existing) {
    db.update(attendances)
      .set({ kilnId: input.kilnId, status: input.status, wageAmount: input.wageAmount })
      .where(eq(attendances._id, existing._id))
      .run();
  } else {
    db.insert(attendances)
      .values({
        _id: randomUUID(),
        kilnId: input.kilnId,
        personId: input.personId,
        date: day,
        status: input.status,
        wageAmount: input.wageAmount,
      })
      .run();
  }

  const record = db
    .select()
    .from(attendances)
    .where(and(eq(attendances.personId, input.personId), eq(attendances.date, day)))
    .get()!;
  emitToKiln(input.kilnId, "attendance:update", record);
  return record;
}

export async function listAttendanceForDay(kilnId: string, date: Date) {
  const day = startOfDay(date);
  const rows = await db.select().from(attendances).where(and(eq(attendances.kilnId, kilnId), eq(attendances.date, day))).all();
  const personIds = [...new Set(rows.map((r) => r.personId))];
  if (personIds.length === 0) return rows;
  const peopleRows = await db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, personIds)).all();
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, personId: personById.get(r.personId) ?? r.personId }));
}

export interface FaceCheckInInput {
  kilnId: string;
  descriptor: number[];
  latitude: number;
  longitude: number;
}

// Kiosk flow: worker looks at the camera, no name/ID selection needed.
// 1) reject if outside the kiln's geofence, 2) find the closest enrolled
// face among this kiln's workers/helpers, 3) reject if even the closest
// match is too far in face-space to trust, 4) mark today's attendance.
export async function faceCheckIn(input: FaceCheckInInput) {
  const kiln = db.select().from(kilns).where(eq(kilns._id, input.kilnId)).get();
  if (!kiln) throw new Error("Kiln not found");

  if (kiln.latitude != null && kiln.longitude != null) {
    const distance = haversineDistanceMeters(kiln.latitude, kiln.longitude, input.latitude, input.longitude);
    if (distance > (kiln.radiusMeters ?? 200)) {
      throw new Error(`Outside kiln radius (${Math.round(distance)}m away, allowed ${kiln.radiusMeters ?? 200}m)`);
    }
  }

  const candidates = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.kilnId, input.kilnId),
        inArray(people.type, ["WORKER", "HELPER"]),
        eq(people.active, true),
        isNotNull(people.faceDescriptor)
      )
    )
    .all();

  let best: (typeof candidates)[number] | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = euclideanDistance(candidate.faceDescriptor as number[], input.descriptor);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (!best || bestDistance > FACE_MATCH_THRESHOLD) {
    throw new Error("Face not recognized — try again or check in manually");
  }

  const record = await markAttendance({
    kilnId: input.kilnId,
    personId: best._id,
    date: new Date(),
    status: "PRESENT",
  });

  return { record, person: { id: best._id, name: best.name }, matchDistance: bestDistance };
}
