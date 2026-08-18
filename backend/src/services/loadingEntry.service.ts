import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { loadingEntries, dispatches, people } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export interface CreateLoadingInput {
  kilnId: string;
  dispatchId?: string;
  palledarId: string;
  bricksCount: number;
  ratePerThousand: number;
  date?: Date;
  notes?: string;
}

// Count mismatch check: if every loading entry logged against a dispatch
// sums to noticeably more than that dispatch's own bricksCount, someone
// inflated the loading count to earn a bigger piece-rate payout — flagged,
// not blocked, since the munim still needs to be able to correct an
// earlier under-count.
export async function createLoadingEntry(input: CreateLoadingInput) {
  await assertPersonOfType(input.kilnId, input.palledarId, ["WORKER", "LABOUR_CONTRACTOR"]);

  let countMismatch = false;
  let dispatchBricksCount: number | null = null;

  if (input.dispatchId) {
    const dispatch = (await db.select().from(dispatches).where(and(eq(dispatches._id, input.dispatchId), eq(dispatches.kilnId, input.kilnId))))[0];
    if (!dispatch) throw new Error("Referenced dispatch not found in this kiln");
    dispatchBricksCount = dispatch.bricksCount;

    const priorEntries = await db.select().from(loadingEntries).where(and(eq(loadingEntries.kilnId, input.kilnId), eq(loadingEntries.dispatchId, input.dispatchId)));
    const priorTotal = priorEntries.reduce((sum, e) => sum + e.bricksCount, 0);
    const newTotal = priorTotal + input.bricksCount;
    countMismatch = newTotal > dispatch.bricksCount * 1.02;
  }

  const _id = randomUUID();
  await db.insert(loadingEntries).values({ ...input, _id });
  const entry = (await db.select().from(loadingEntries).where(eq(loadingEntries._id, _id)))[0]!;

  const wage = (input.bricksCount / 1000) * input.ratePerThousand;
  await addLedgerEntry({
    kilnId: input.kilnId,
    personId: input.palledarId,
    direction: "DUE",
    amount: wage,
    reason: `Loading: ${input.bricksCount.toLocaleString()} bricks`,
    date: input.date,
  });

  emitToKiln(input.kilnId, "loading:update", { ...entry, countMismatch, dispatchBricksCount });
  return { entry, countMismatch, dispatchBricksCount };
}

export async function listLoadingEntries(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(loadingEntries).where(and(eq(loadingEntries.kilnId, kilnId), gte(loadingEntries.date, since))).orderBy(desc(loadingEntries.date));

  const palledarIds = [...new Set(rows.map((r) => r.palledarId))];
  const dispatchIds = [...new Set(rows.map((r) => r.dispatchId).filter((v): v is string => !!v))];
  const [palledarRows, dispatchRows] = await Promise.all([
    palledarIds.length ? db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, palledarIds)) : [],
    dispatchIds.length ? db.select({ _id: dispatches._id, slipNumber: dispatches.slipNumber, bricksCount: dispatches.bricksCount }).from(dispatches).where(inArray(dispatches._id, dispatchIds)) : [],
  ]);
  const palledarById = new Map(palledarRows.map((p) => [p._id, p]));
  const dispatchById = new Map(dispatchRows.map((d) => [d._id, d]));
  return rows.map((r) => ({
    ...r,
    palledarId: palledarById.get(r.palledarId) ?? r.palledarId,
    dispatchId: r.dispatchId ? dispatchById.get(r.dispatchId) ?? r.dispatchId : r.dispatchId,
  }));
}
