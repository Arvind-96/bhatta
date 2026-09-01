// One-time data migration for the Bharai (stacking) stage restructure:
// the old 2-stage model (TRANSPORT / CHAMBER_STACKING) became a 3-stage
// model (PHAD_TO_STOCK / PHAD_TO_CHAMBER / STOCK_TO_CHAMBER) since each
// stage now carries its own labor rate. Old TRANSPORT ("ground lifting &
// transport") maps to the closest new equivalent, PHAD_TO_STOCK; old
// CHAMBER_STACKING maps to STOCK_TO_CHAMBER. PHAD_TO_CHAMBER is a brand
// new option with no historical equivalent, so nothing maps to it here —
// existing entries stay split between the other two.
//
// Touches three places that stored the old two-value strings: people.
// workType (BHARAI_TRANSPORT/BHARAI_CHAMBER_STACKING), people.
// stackingStage, and stacking_entries.stage. Values are plain varchars
// with no DB-level enum constraint, so old rows would otherwise sit there
// holding strings the application no longer recognizes.
//
// Idempotent — safe to re-run: counts and updates only rows still holding
// an old value, so a second run finds (and reports) zero.
//
// Run with: npx tsx src/scripts/migrateStackingStages.ts
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { people, stackingEntries } from "../db/schema";

async function main() {
  const peopleWorkTypeMappings: [string, string][] = [
    ["BHARAI_TRANSPORT", "BHARAI_PHAD_TO_STOCK"],
    ["BHARAI_CHAMBER_STACKING", "BHARAI_STOCK_TO_CHAMBER"],
  ];
  for (const [oldValue, newValue] of peopleWorkTypeMappings) {
    const before = (await db.select({ c: sql<number>`count(*)` }).from(people).where(eq(people.workType, oldValue as never)))[0]!.c;
    if (before > 0) {
      await db.update(people).set({ workType: newValue as never }).where(eq(people.workType, oldValue as never));
    }
    console.log(`people.workType ${oldValue} -> ${newValue}: ${before} row(s) updated`);
  }

  const stageMappings: [string, string][] = [
    ["TRANSPORT", "PHAD_TO_STOCK"],
    ["CHAMBER_STACKING", "STOCK_TO_CHAMBER"],
  ];
  for (const [oldValue, newValue] of stageMappings) {
    const beforePeople = (await db.select({ c: sql<number>`count(*)` }).from(people).where(eq(people.stackingStage, oldValue as never)))[0]!.c;
    if (beforePeople > 0) {
      await db.update(people).set({ stackingStage: newValue as never }).where(eq(people.stackingStage, oldValue as never));
    }
    console.log(`people.stackingStage ${oldValue} -> ${newValue}: ${beforePeople} row(s) updated`);

    const beforeEntries = (await db.select({ c: sql<number>`count(*)` }).from(stackingEntries).where(eq(stackingEntries.stage, oldValue as never)))[0]!.c;
    if (beforeEntries > 0) {
      await db.update(stackingEntries).set({ stage: newValue as never }).where(eq(stackingEntries.stage, oldValue as never));
    }
    console.log(`stacking_entries.stage ${oldValue} -> ${newValue}: ${beforeEntries} row(s) updated`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
