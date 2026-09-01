// One-time cleanup: removes 5 leftover test person records found sitting
// inside the real JVS Bricks kiln itself (not a separate test kiln) —
// "pathai labour test 1", "ZZDIAG_TestWorker", "test" (a Sand Contractor
// with a real-looking ₹1,00,000 sand contract), "__AUDIT_TEST__ Sand
// Contractor", and "__TEST_LANDOWNER__". Deletes every row anywhere in the
// schema that references one of these 5 person ids, discovered generically
// by scanning every exported table for a column plausibly referencing a
// person (personId, landownerId, sandContractorId, driverId), then the
// person rows themselves.
//
// Run with: npx tsx src/scripts/deleteTestPeopleInJvs.ts
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema";

const KILN_ID = "6a7741541033c0f439c33f9f"; // JVS Bricks
const TEST_PERSON_IDS = [
  "27c752b0-2727-48c7-858c-97b6504f87d5", // pathai labour test 1
  "4075b469-17b3-49b0-a709-7acc14230000", // ZZDIAG_TestWorker
  "419a6b86-e090-44d2-bb9f-b21d4681c06c", // test (SAND_CONTRACTOR, SD-1 contract)
  "a4b7b5c0-1b7a-4a35-a7a9-76a01e8926e8", // __AUDIT_TEST__ Sand Contractor
  "f140ffd8-8401-4419-8ffb-61f22a1d456b", // __TEST_LANDOWNER__
];
const PERSON_REF_COLUMNS = ["personId", "landownerId", "sandContractorId", "driverId"];

async function main() {
  console.log(`Deleting ${TEST_PERSON_IDS.length} test person record(s) and everything referencing them...`);

  let totalRows = 0;
  for (const [exportName, value] of Object.entries(schema)) {
    if (exportName === "people") continue; // handled last
    if (!value || typeof value !== "object") continue;
    const table = value as any;
    for (const col of PERSON_REF_COLUMNS) {
      if (!table[col] || typeof table[col] !== "object") continue;
      const result: any = await db.delete(table).where(inArray(table[col], TEST_PERSON_IDS));
      const affected = result?.[0]?.affectedRows ?? 0;
      if (affected > 0) {
        console.log(`  ${exportName}.${col}: deleted ${affected} row(s)`);
        totalRows += affected;
      }
    }
  }

  console.log(`\nDeleting the ${TEST_PERSON_IDS.length} test person row(s) themselves...`);
  const peopleResult: any = await db.delete(schema.people).where(inArray(schema.people._id, TEST_PERSON_IDS));
  console.log(`  deleted ${peopleResult?.[0]?.affectedRows ?? 0} row(s) from people`);

  console.log(`\nTotal related rows deleted: ${totalRows}`);

  console.log("\nVerifying: zero rows should reference these ids anywhere now...");
  let anyLeft = false;
  for (const [exportName, value] of Object.entries(schema)) {
    if (!value || typeof value !== "object") continue;
    const table = value as any;
    for (const col of [...PERSON_REF_COLUMNS, "_id"]) {
      if (exportName !== "people" && col === "_id") continue;
      if (!table[col] || typeof table[col] !== "object") continue;
      const rows = await db.select({ id: table[col] }).from(table).where(inArray(table[col], TEST_PERSON_IDS));
      if (rows.length > 0) {
        anyLeft = true;
        console.log(`  STILL referenced in ${exportName}.${col}: ${rows.length} row(s)`);
      }
    }
  }
  if (!anyLeft) console.log("  All clear.");

  console.log("\nCleanup complete.");
  process.exit(anyLeft ? 1 : 0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
