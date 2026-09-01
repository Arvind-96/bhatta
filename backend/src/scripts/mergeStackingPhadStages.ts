// One-time data migration for the Bharai (stacking) stage merge: the
// short-lived 3-stage model (PHAD_TO_STOCK / PHAD_TO_CHAMBER /
// STOCK_TO_CHAMBER) is reverting to 2 stages — PHAD_TO_CHAMBER merges back
// into PHAD_TO_STOCK (now labeled "Phad to stock/chamber (Gher)"), since
// the client wants one stage/rate covering both destinations from the
// Phad. STOCK_TO_CHAMBER is unchanged.
//
// Touches people.workType (BHARAI_PHAD_TO_CHAMBER -> BHARAI_PHAD_TO_STOCK),
// people.stackingStage, and stacking_entries.stage (both PHAD_TO_CHAMBER ->
// PHAD_TO_STOCK). Values are plain varchars with no DB-level enum
// constraint.
//
// Idempotent — safe to re-run: counts and updates only rows still holding
// PHAD_TO_CHAMBER, so a second run finds (and reports) zero.
//
// Run with: npx tsx src/scripts/mergeStackingPhadStages.ts
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { people, stackingEntries } from "../db/schema";

async function main() {
  const beforeWorkType = (await db.select({ c: sql<number>`count(*)` }).from(people).where(eq(people.workType, "BHARAI_PHAD_TO_CHAMBER" as never)))[0]!.c;
  if (beforeWorkType > 0) {
    await db.update(people).set({ workType: "BHARAI_PHAD_TO_STOCK" as never }).where(eq(people.workType, "BHARAI_PHAD_TO_CHAMBER" as never));
  }
  console.log(`people.workType BHARAI_PHAD_TO_CHAMBER -> BHARAI_PHAD_TO_STOCK: ${beforeWorkType} row(s) updated`);

  const beforeStackingStage = (await db.select({ c: sql<number>`count(*)` }).from(people).where(eq(people.stackingStage, "PHAD_TO_CHAMBER" as never)))[0]!.c;
  if (beforeStackingStage > 0) {
    await db.update(people).set({ stackingStage: "PHAD_TO_STOCK" as never }).where(eq(people.stackingStage, "PHAD_TO_CHAMBER" as never));
  }
  console.log(`people.stackingStage PHAD_TO_CHAMBER -> PHAD_TO_STOCK: ${beforeStackingStage} row(s) updated`);

  const beforeEntries = (await db.select({ c: sql<number>`count(*)` }).from(stackingEntries).where(eq(stackingEntries.stage, "PHAD_TO_CHAMBER" as never)))[0]!.c;
  if (beforeEntries > 0) {
    await db.update(stackingEntries).set({ stage: "PHAD_TO_STOCK" as never }).where(eq(stackingEntries.stage, "PHAD_TO_CHAMBER" as never));
  }
  console.log(`stacking_entries.stage PHAD_TO_CHAMBER -> PHAD_TO_STOCK: ${beforeEntries} row(s) updated`);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
