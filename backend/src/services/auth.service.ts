import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, inArray, count } from "drizzle-orm";
import { db } from "../db/client";
import { kilns, users, kilnMemberships, people, ghers } from "../db/schema";
import { env } from "../config/env";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role?: "OWNER" | "MANAGER" | "MUNIM";
  kilnId?: string;
  kilnName?: string;
  kilnLocation?: string;
}

function signToken(userId: string) {
  return jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: "30d" });
}

function toPublicUser(user: { _id: string; name: string; email: string }) {
  return { id: user._id, name: user.name, email: user.email };
}

// A kiln with the onboarding flag already set is done, full stop. One
// created before the flag existed is treated as done too as long as it has
// real activity (people or chambers already set up) — otherwise every
// pre-existing kiln would suddenly get the setup wizard shoved in front of
// it. Only a kiln that's both flagless and genuinely empty counts as
// needing setup.
async function needsSetup(kilnId: string, onboardedAt: Date | null | undefined) {
  if (onboardedAt) return false;
  const [personCount, gherCount] = await Promise.all([
    db.select({ n: count() }).from(people).where(eq(people.kilnId, kilnId)).get(),
    db.select({ n: count() }).from(ghers).where(eq(ghers.kilnId, kilnId)).get(),
  ]);
  return (personCount?.n ?? 0) === 0 && (gherCount?.n ?? 0) === 0;
}

async function listMemberships(userId: string) {
  const memberships = await db.select().from(kilnMemberships).where(eq(kilnMemberships.userId, userId)).all();
  if (memberships.length === 0) return [];

  const kilnRows = await db
    .select()
    .from(kilns)
    .where(inArray(kilns._id, memberships.map((m) => m.kilnId)))
    .all();
  const kilnById = new Map(kilnRows.map((k) => [k._id, k]));

  return Promise.all(
    memberships.map(async (m) => {
      const kiln = kilnById.get(m.kilnId);
      return {
        kilnId: m.kilnId,
        role: m.role,
        name: kiln?.name ?? "Unknown",
        location: kiln?.location,
        phone: kiln?.phone,
        needsSetup: await needsSetup(m.kilnId, kiln?.onboardedAt),
      };
    })
  );
}

export async function registerUser(input: RegisterInput) {
  const existing = db.select().from(users).where(eq(users.email, input.email)).get();
  if (existing) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const userId = randomUUID();
  db.insert(users).values({ _id: userId, name: input.name, email: input.email, passwordHash }).run();

  let kilnId: string;
  let role: "OWNER" | "MANAGER" | "MUNIM";

  if (input.kilnId) {
    const kiln = db.select().from(kilns).where(eq(kilns._id, input.kilnId)).get();
    if (!kiln) throw new Error("Kiln not found");
    kilnId = kiln._id;
    role = input.role ?? "MUNIM";
  } else {
    if (!input.kilnName) throw new Error("kilnName is required to create a new kiln");
    kilnId = randomUUID();
    db.insert(kilns).values({ _id: kilnId, name: input.kilnName, location: input.kilnLocation }).run();
    role = "OWNER";
  }

  db.insert(kilnMemberships).values({ _id: randomUUID(), userId, kilnId, role }).run();

  const user = db.select().from(users).where(eq(users._id, userId)).get()!;
  const token = signToken(userId);
  return { token, user: toPublicUser(user), kilns: await listMemberships(userId) };
}

export async function loginUser(email: string, password: string) {
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  const token = signToken(user._id);
  return { token, user: toPublicUser(user), kilns: await listMemberships(user._id) };
}

export async function getCurrentUser(userId: string) {
  const user = db.select().from(users).where(eq(users._id, userId)).get();
  if (!user) throw new Error("User not found");
  return { user: toPublicUser(user), kilns: await listMemberships(userId) };
}

// An existing owner spinning up another bhatta under the same account.
export async function createAdditionalKiln(userId: string, name: string, location?: string) {
  const kilnId = randomUUID();
  db.insert(kilns).values({ _id: kilnId, name, location }).run();
  db.insert(kilnMemberships).values({ _id: randomUUID(), userId, kilnId, role: "OWNER" }).run();
  return { kilnId, role: "OWNER" as const, name, location };
}

export async function listUserKilns(userId: string) {
  return listMemberships(userId);
}

export async function setKilnGeofence(
  kilnId: string,
  input: { latitude: number; longitude: number; radiusMeters?: number }
) {
  db.update(kilns)
    .set({ latitude: input.latitude, longitude: input.longitude, radiusMeters: input.radiusMeters ?? 200 })
    .where(eq(kilns._id, kilnId))
    .run();
  const kiln = db.select().from(kilns).where(eq(kilns._id, kilnId)).get();
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function setYardCapacity(kilnId: string, yardCapacityBricks: number) {
  db.update(kilns).set({ yardCapacityBricks }).where(eq(kilns._id, kilnId)).run();
  const kiln = db.select().from(kilns).where(eq(kilns._id, kilnId)).get();
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function updateKilnProfile(
  kilnId: string,
  input: { name?: string; location?: string; phone?: string }
) {
  db.update(kilns).set(input).where(eq(kilns._id, kilnId)).run();
  const kiln = db.select().from(kilns).where(eq(kilns._id, kilnId)).get();
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function completeOnboarding(kilnId: string) {
  db.update(kilns).set({ onboardedAt: new Date() }).where(eq(kilns._id, kilnId)).run();
  const kiln = db.select().from(kilns).where(eq(kilns._id, kilnId)).get();
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = db.select().from(users).where(eq(users._id, userId)).get();
  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  db.update(users).set({ passwordHash }).where(eq(users._id, userId)).run();
}
