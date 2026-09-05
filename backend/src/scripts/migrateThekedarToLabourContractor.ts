// One-time data migration for the THEKEDAR → LABOUR_CONTRACTOR merge (C2):
// THEKEDAR was a distinct person type in the schema, but every contractor-
// link field validation only ever allow-listed LABOUR_CONTRACTOR — a
// THEKEDAR-typed person could never actually be assigned as anyone's
// contractor, and the "Add Thekedar" UI already created a LABOUR_CONTRACTOR
// instead (see AddThekedarModal.tsx). Structurally dead, so merged into
// LABOUR_CONTRACTOR per the client's decision.
//
// people.type is a plain varchar with no DB-level enum constraint, so any
// existing THEKEDAR row would otherwise sit there holding a type value the
// application no longer recognizes.
//
// Idempotent — safe to re-run: counts and updates only rows still holding
// the old value, so a second run finds (and reports) zero.
//
// Run with: npx tsx src/scripts/migrateThekedarToLabourContractor.ts
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { people } from "../db/schema";

async function main() {
  const before = (await db.select({ c: sql<number>`count(*)` }).from(people).where(eq(people.type, "THEKEDAR" as never)))[0]!.c;
  if (before > 0) {
    await db.update(people).set({ type: "LABOUR_CONTRACTOR" }).where(eq(people.type, "THEKEDAR" as never));
  }
  console.log(`people.type THEKEDAR -> LABOUR_CONTRACTOR: ${before} row(s) updated`);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
