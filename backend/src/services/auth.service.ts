import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { asc, eq, inArray, count } from "drizzle-orm";
import { db, DATA_DIR } from "../db/client";
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
  const [personCountRows, gherCountRows] = await Promise.all([
    db.select({ n: count() }).from(people).where(eq(people.kilnId, kilnId)),
    db.select({ n: count() }).from(ghers).where(eq(ghers.kilnId, kilnId)),
  ]);
  const personCount = personCountRows[0];
  const gherCount = gherCountRows[0];
  return (personCount?.n ?? 0) === 0 && (gherCount?.n ?? 0) === 0;
}

async function listMemberships(userId: string) {
  const memberships = await db.select().from(kilnMemberships).where(eq(kilnMemberships.userId, userId));
  if (memberships.length === 0) return [];

  const kilnRows = await db
    .select()
    .from(kilns)
    .where(inArray(kilns._id, memberships.map((m) => m.kilnId)));
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
        seasonStartMonth: kiln?.seasonStartMonth ?? 8,
        seasonStartDay: kiln?.seasonStartDay ?? 1,
        dayShiftStart: kiln?.dayShiftStart ?? "08:00",
        dayShiftEnd: kiln?.dayShiftEnd ?? "18:00",
        gstNumber: kiln?.gstNumber ?? undefined,
        stateCode: kiln?.stateCode ?? undefined,
        bankAccountNumber: kiln?.bankAccountNumber ?? undefined,
        bankName: kiln?.bankName ?? undefined,
        bankIfscCode: kiln?.bankIfscCode ?? undefined,
        signaturePath: kiln?.signaturePath ?? undefined,
        defaultTermsAndConditions: kiln?.defaultTermsAndConditions ?? undefined,
        needsSetup: await needsSetup(m.kilnId, kiln?.onboardedAt),
      };
    })
  );
}

export async function registerUser(input: RegisterInput) {
  const existing = (await db.select().from(users).where(eq(users.email, input.email)))[0];
  if (existing) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const userId = randomUUID();
  await db.insert(users).values({ _id: userId, name: input.name, email: input.email, passwordHash });

  let kilnId: string;
  let role: "OWNER" | "MANAGER" | "MUNIM";

  if (input.kilnId) {
    const kiln = (await db.select().from(kilns).where(eq(kilns._id, input.kilnId)))[0];
    if (!kiln) throw new Error("Kiln not found");
    kilnId = kiln._id;
    role = input.role ?? "MUNIM";
  } else {
    if (!input.kilnName) throw new Error("kilnName is required to create a new kiln");
    kilnId = randomUUID();
    await db.insert(kilns).values({ _id: kilnId, name: input.kilnName, location: input.kilnLocation });
    role = "OWNER";
  }

  await db.insert(kilnMemberships).values({ _id: randomUUID(), userId, kilnId, role });

  const user = (await db.select().from(users).where(eq(users._id, userId)))[0]!;
  const token = signToken(userId);
  return { token, user: toPublicUser(user), kilns: await listMemberships(userId) };
}

export async function loginUser(email: string, password: string) {
  const user = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (!user) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  const token = signToken(user._id);
  return { token, user: toPublicUser(user), kilns: await listMemberships(user._id) };
}

export async function getCurrentUser(userId: string) {
  const user = (await db.select().from(users).where(eq(users._id, userId)))[0];
  if (!user) throw new Error("User not found");
  return { user: toPublicUser(user), kilns: await listMemberships(userId) };
}

// An existing owner spinning up another bhatta under the same account.
export async function createAdditionalKiln(userId: string, name: string, location?: string) {
  const kilnId = randomUUID();
  await db.insert(kilns).values({ _id: kilnId, name, location });
  await db.insert(kilnMemberships).values({ _id: randomUUID(), userId, kilnId, role: "OWNER" });
  return { kilnId, role: "OWNER" as const, name, location };
}

export async function listUserKilns(userId: string) {
  return listMemberships(userId);
}

// The app has no login screen, so the frontend has no session to derive a
// kiln from on boot. This is the unauthenticated equivalent of a
// login response's `kilns[0]` — the earliest-created kiln, which is this
// deployment's one real bhatta (resolveKiln falls back to the same kiln
// for every request that doesn't send an X-Kiln-Id).
export async function defaultKilnPublicInfo() {
  const kiln = (await db.select().from(kilns).orderBy(asc(kilns.createdAt)))[0];
  if (!kiln) throw new Error("No kiln configured yet");
  return {
    kilnId: kiln._id,
    role: "OWNER" as const,
    name: kiln.name,
    location: kiln.location ?? undefined,
    phone: kiln.phone ?? undefined,
    seasonStartMonth: kiln.seasonStartMonth ?? 8,
    seasonStartDay: kiln.seasonStartDay ?? 1,
    dayShiftStart: kiln.dayShiftStart ?? "08:00",
    dayShiftEnd: kiln.dayShiftEnd ?? "18:00",
    gstNumber: kiln.gstNumber ?? undefined,
    stateCode: kiln.stateCode ?? undefined,
    bankAccountNumber: kiln.bankAccountNumber ?? undefined,
    bankName: kiln.bankName ?? undefined,
    bankIfscCode: kiln.bankIfscCode ?? undefined,
    signaturePath: kiln.signaturePath ?? undefined,
    defaultTermsAndConditions: kiln.defaultTermsAndConditions ?? undefined,
    needsSetup: await needsSetup(kiln._id, kiln.onboardedAt),
  };
}

export async function setKilnGeofence(
  kilnId: string,
  input: { latitude: number; longitude: number; radiusMeters?: number }
) {
  await db.update(kilns)
    .set({ latitude: input.latitude, longitude: input.longitude, radiusMeters: input.radiusMeters ?? 200 })
    .where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function setYardCapacity(kilnId: string, yardCapacityBricks: number) {
  await db.update(kilns).set({ yardCapacityBricks }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function setSeason(kilnId: string, seasonStartMonth: number, seasonStartDay: number) {
  await db.update(kilns).set({ seasonStartMonth, seasonStartDay }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function setShiftTimes(kilnId: string, dayShiftStart: string, dayShiftEnd: string) {
  await db.update(kilns).set({ dayShiftStart, dayShiftEnd }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function setGstNumber(kilnId: string, gstNumber: string | null) {
  await db.update(kilns).set({ gstNumber }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function updateKilnProfile(
  kilnId: string,
  input: { name?: string; location?: string; phone?: string }
) {
  await db.update(kilns).set(input).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export interface KilnBillingDetailsInput {
  stateCode?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankIfscCode?: string | null;
  defaultTermsAndConditions?: string | null;
}

// GST invoice billing details (Settings > Billing) — every field is
// print-only (see printInvoiceRecord), never consulted anywhere else, so
// this is a plain field patch with no side effects, same shape as
// setGstNumber/updateKilnProfile above.
export async function setKilnBillingDetails(kilnId: string, input: KilnBillingDetailsInput) {
  await db.update(kilns).set(input).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

const KILN_FILES_DIR = path.join(DATA_DIR, "kilns");

function kilnFileDir(kilnId: string) {
  return path.join(KILN_FILES_DIR, kilnId);
}

// Same replace-in-place pattern as person.service.ts's replacePersonFile —
// deletes any stale signature file of the same kind before writing the new
// one, so re-uploading never leaves an orphaned old file on disk.
export async function saveKilnSignature(kilnId: string, file: { buffer: Buffer; originalname: string }) {
  const existing = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!existing) throw new Error("Kiln not found");

  const dir = kilnFileDir(kilnId);
  fs.mkdirSync(dir, { recursive: true });
  for (const stale of fs.readdirSync(dir).filter((f) => f.startsWith("signature"))) {
    fs.unlinkSync(path.join(dir, stale));
  }

  const ext = path.extname(file.originalname) || ".bin";
  const relativePath = path.join("kilns", kilnId, `signature${ext}`);
  fs.writeFileSync(path.join(DATA_DIR, relativePath), file.buffer);

  await db.update(kilns).set({ signaturePath: relativePath }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0]!;
  return kiln;
}

export async function getKilnSignaturePath(kilnId: string) {
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  if (!kiln.signaturePath) return null;
  return path.join(DATA_DIR, kiln.signaturePath);
}

export async function completeOnboarding(kilnId: string) {
  await db.update(kilns).set({ onboardedAt: new Date() }).where(eq(kilns._id, kilnId));
  const kiln = (await db.select().from(kilns).where(eq(kilns._id, kilnId)))[0];
  if (!kiln) throw new Error("Kiln not found");
  return kiln;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = (await db.select().from(users).where(eq(users._id, userId)))[0];
  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users._id, userId));
}
