import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { pathaiSites } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreatePathaiSiteInput {
  kilnId: string;
  name: string;
  distanceKm?: number;
  notes?: string;
}

export async function createPathaiSite(input: CreatePathaiSiteInput) {
  const _id = randomUUID();
  await db.insert(pathaiSites).values({ ...input, _id });
  const site = (await db.select().from(pathaiSites).where(eq(pathaiSites._id, _id)))[0]!;
  emitToKiln(input.kilnId, "pathaiSite:update", site);
  return site;
}

export async function listPathaiSites(kilnId: string, includeInactive = false) {
  const conditions = [eq(pathaiSites.kilnId, kilnId)];
  if (!includeInactive) conditions.push(eq(pathaiSites.active, true));
  return db.select().from(pathaiSites).where(and(...conditions)).orderBy(asc(pathaiSites.name));
}

export async function assertPathaiSiteInKiln(kilnId: string, siteId: string) {
  const site = (await db.select().from(pathaiSites).where(and(eq(pathaiSites._id, siteId), eq(pathaiSites.kilnId, kilnId))))[0];
  if (!site) throw new Error("Referenced Pathai site not found in this kiln");
  return site;
}

export interface UpdatePathaiSiteInput {
  name?: string;
  distanceKm?: number;
  notes?: string;
  active?: boolean;
}

export async function updatePathaiSite(kilnId: string, siteId: string, input: UpdatePathaiSiteInput) {
  await assertPathaiSiteInKiln(kilnId, siteId);
  await db.update(pathaiSites).set(input).where(eq(pathaiSites._id, siteId));
  const updated = (await db.select().from(pathaiSites).where(eq(pathaiSites._id, siteId)))[0]!;
  emitToKiln(kilnId, "pathaiSite:update", updated);
  return updated;
}
