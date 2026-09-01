import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { doctors } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreateDoctorInput {
  kilnId: string;
  name: string;
  phone?: string;
  qualification?: string;
  clinicAddress?: string;
  notes?: string;
}

export async function createDoctor(input: CreateDoctorInput) {
  const _id = randomUUID();
  await db.insert(doctors).values({ ...input, _id });
  const doctor = (await db.select().from(doctors).where(eq(doctors._id, _id)))[0]!;
  emitToKiln(input.kilnId, "doctor:update", doctor);
  return doctor;
}

export async function listDoctors(kilnId: string) {
  return await db
    .select()
    .from(doctors)
    .where(and(eq(doctors.kilnId, kilnId), eq(doctors.active, true)))
    .orderBy(desc(doctors.createdAt));
}

export async function assertDoctorInKiln(kilnId: string, doctorId: string) {
  const doctor = (await db.select().from(doctors).where(and(eq(doctors._id, doctorId), eq(doctors.kilnId, kilnId))))[0];
  if (!doctor) throw new Error("Doctor not found in this kiln");
  return doctor;
}

export interface UpdateDoctorInput {
  name?: string;
  phone?: string;
  qualification?: string;
  clinicAddress?: string;
  notes?: string;
  active?: boolean;
}

export async function updateDoctor(kilnId: string, doctorId: string, input: UpdateDoctorInput) {
  await assertDoctorInKiln(kilnId, doctorId);
  await db.update(doctors).set(input).where(eq(doctors._id, doctorId));
  const doctor = (await db.select().from(doctors).where(eq(doctors._id, doctorId)))[0]!;
  emitToKiln(kilnId, "doctor:update", doctor);
  return doctor;
}

// Soft delete — same pattern as person.service.ts's deactivate, so a
// doctor with historical visits stays linkable from those visits' own
// records instead of leaving a dangling doctorId.
export async function deleteDoctor(kilnId: string, doctorId: string) {
  await assertDoctorInKiln(kilnId, doctorId);
  await db.update(doctors).set({ active: false }).where(eq(doctors._id, doctorId));
  emitToKiln(kilnId, "doctor:update", { _id: doctorId, deleted: true });
}
