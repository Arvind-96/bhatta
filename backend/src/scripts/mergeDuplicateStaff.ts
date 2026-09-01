// One-time cleanup for a real data-quality bug found while investigating
// an "August salary is wrong" report: 7 staff names (Anil Kumar, Bahadur
// Singh, Mahender Driver, Mangal Sardar, Ramesh Sharma, Ramu, Rinku) each
// had 2-4 duplicate `people` rows — identical name/type/salary, created
// in a tight window (mostly 2026-08-12/13, apparently a migration or
// import running more than once), each independently generating its own
// salary slip. The Salary page showed the same person listed multiple
// times with the same salary, inflating the apparent August staff wage
// bill.
//
// Investigated each duplicate's real activity first (ledger entries,
// attendance, work/stacking/molding entries, contractorId-style
// cross-references) before touching anything: every duplicate except one
// Ramu record was a completely empty shell (0 ledger, 0 attendance).
// Reuses the existing, already-tested mergeLedgers() (the app's own
// "Ledgers-Merge" utility) for every pair — it moves any ledger entries
// from the duplicate to the keeper, then deactivates the duplicate, so a
// pair with zero ledger entries just deactivates cleanly and the one pair
// with a real ledger entry (Ramu, ₹500) keeps it visible on the surviving
// profile.
//
// Run with: npx tsx src/scripts/mergeDuplicateStaff.ts
import "dotenv/config";
import { mergeLedgers } from "../services/person.service";
import { db } from "../db/client";
import { people } from "../db/schema";
import { eq } from "drizzle-orm";

const KILN_ID = "6a7741541033c0f439c33f9f"; // JVS Bricks

const MERGES: { name: string; keeper: string; duplicates: string[] }[] = [
  { name: "Anil Kumar", keeper: "6a7d488d1b50f259a10b0c32", duplicates: ["6a7c4d437292763b3bdb17e3", "6a7c4d577292763b3bdb17f3"] },
  { name: "Bahadur Singh", keeper: "6a7d488d1b50f259a10b0c3a", duplicates: ["6a787f1866d727bd8bc26711", "6a7c4d437292763b3bdb17e6", "6a7c4d577292763b3bdb17f6"] },
  { name: "Mahender Driver", keeper: "6a7d488d1b50f259a10b0c3c", duplicates: ["6a7c4d437292763b3bdb17e9", "6a7c4d587292763b3bdb17f9"] },
  { name: "Mangal Sardar", keeper: "6a7d486fb2e7a4e013fd5f47", duplicates: ["6a7c4d417292763b3bdb17de", "6a7c4d577292763b3bdb17ec"] },
  { name: "Ramesh Sharma", keeper: "6a7d488d1b50f259a10b0c30", duplicates: ["6a787f1866d727bd8bc2670e"] },
  { name: "Ramu", keeper: "6a7d486fb2e7a4e013fd5f5d", duplicates: ["6a7c4d577292763b3bdb17f0", "8bca51cd-2035-4dde-8700-0644ac6997d1"] },
  { name: "Rinku", keeper: "6a7d486fb2e7a4e013fd5f63", duplicates: ["a1924f70-2c8d-4e6c-8485-c2652c49e6b8"] },
];

async function main() {
  for (const group of MERGES) {
    // Guard: skip (rather than error out the whole run) if this keeper is
    // somehow already inactive or missing — safe to re-run.
    const keeperRow = (await db.select({ active: people.active }).from(people).where(eq(people._id, group.keeper)))[0];
    if (!keeperRow) {
      console.log(`${group.name}: keeper ${group.keeper} not found, skipping`);
      continue;
    }
    for (const dup of group.duplicates) {
      const dupRow = (await db.select({ active: people.active }).from(people).where(eq(people._id, dup)))[0];
      if (!dupRow) {
        console.log(`${group.name}: duplicate ${dup} not found, skipping`);
        continue;
      }
      if (!dupRow.active) {
        console.log(`${group.name}: duplicate ${dup} already inactive, skipping`);
        continue;
      }
      await mergeLedgers(KILN_ID, dup, group.keeper);
      console.log(`${group.name}: merged ${dup} -> ${group.keeper}`);
    }
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
