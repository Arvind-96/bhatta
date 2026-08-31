import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { seasons } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface CreateSeasonInput {
  label: string;
  startDate: Date;
}

export async function listSeasons(kilnId: string) {
  return db.select().from(seasons).where(eq(seasons.kilnId, kilnId)).orderBy(desc(seasons.startDate), desc(seasons.createdAt));
}

// Starting a new season is the entire "archive the old one" operation —
// no data is copied, moved, or deleted. Every transactional table's own
// seasonId column keeps pointing at whatever season it was created under;
// switching which season is "current" just changes what new writes get
// stamped with and what resolveSeason falls back to by default. See
// db/schema/season.ts's doc comment for why master data and balance
// carry-forward need nothing further done here at all.
export async function createSeason(kilnId: string, input: CreateSeasonInput) {
  await db.update(seasons).set({ isCurrent: false }).where(and(eq(seasons.kilnId, kilnId), eq(seasons.isCurrent, true)));

  const _id = randomUUID();
  await db.insert(seasons).values({ _id, kilnId, label: input.label, startDate: input.startDate, isCurrent: true });
  const row = (await db.select().from(seasons).where(eq(seasons._id, _id)))[0]!;
  emitToKiln(kilnId, "season:update", row);
  return row;
}

// Every kiln needs exactly one current season to exist the moment it's
// created — resolveSeason has no other fallback once X-Kiln-Id resolves to
// a real kiln, so a kiln with zero season rows would 500 on its very first
// request. Called once, right after a new kiln row is inserted (both
// registerUser's own-kiln path and createAdditionalKiln).
export async function createInitialSeason(kilnId: string, startDate: Date) {
  const _id = randomUUID();
  await db.insert(seasons).values({ _id, kilnId, label: "Season 1", startDate, isCurrent: true });
  return (await db.select().from(seasons).where(eq(seasons._id, _id)))[0]!;
}
