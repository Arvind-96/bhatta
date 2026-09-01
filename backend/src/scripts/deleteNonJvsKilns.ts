// One-time cleanup: this deployment is for JVS Bricks only. Deletes every
// other kiln (tenant) and every row anywhere in the schema that belongs to
// one, discovered generically by scanning every exported table for a
// `kilnId` column (rather than hand-listing ~30 tables, which is exactly
// the kind of list that's easy to silently miss one entry on). Also drops
// kiln_memberships for those kilns, then any user account left with zero
// remaining memberships afterward (a login that existed only for a now-
// deleted kiln).
//
// NOT idempotent in the sense of "safe to run twice for the same data" —
// it's a real, permanent delete. Intended to run exactly once, after a
// fresh mysqldump backup.
//
// Run with: npx tsx src/scripts/deleteNonJvsKilns.ts
import "dotenv/config";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema";

const JVS_BRICKS_KILN_ID = "6a7741541033c0f439c33f9f";

function isTableWithKilnId(value: unknown): value is { kilnId: unknown; _id: unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    "kilnId" in (value as any) &&
    "_id" in (value as any) &&
    typeof (value as any).kilnId === "object"
  );
}

async function main() {
  const allKilns = await db.select().from(schema.kilns);
  const targetKilns = allKilns.filter((k) => k._id !== JVS_BRICKS_KILN_ID);

  if (targetKilns.length === 0) {
    console.log("No non-JVS-Bricks kilns found. Nothing to do.");
    process.exit(0);
  }

  console.log(`Kilns to delete (${targetKilns.length}):`);
  for (const k of targetKilns) console.log(`  ${k._id}  ${k.name}`);
  const targetIds = targetKilns.map((k) => k._id);

  console.log("\nDeleting kiln-scoped rows from every table with a kilnId column...");
  let totalRows = 0;
  for (const [exportName, value] of Object.entries(schema)) {
    if (exportName === "kilns") continue; // handled last
    if (!isTableWithKilnId(value)) continue;
    const table = value as any;
    const result: any = await db.delete(table).where(inArray(table.kilnId, targetIds));
    const affected = result?.[0]?.affectedRows ?? result?.rowsAffected ?? 0;
    if (affected > 0) {
      console.log(`  ${exportName}: deleted ${affected} row(s)`);
      totalRows += affected;
    }
  }

  console.log(`\nDeleting kiln_memberships for these kilns...`);
  const membershipResult: any = await db.delete(schema.kilnMemberships).where(inArray(schema.kilnMemberships.kilnId, targetIds));
  console.log(`  deleted ${membershipResult?.[0]?.affectedRows ?? 0} membership row(s)`);

  console.log(`\nDeleting the ${targetKilns.length} kiln row(s) themselves...`);
  await db.delete(schema.kilns).where(inArray(schema.kilns._id, targetIds));

  console.log("\nChecking for now-orphaned user accounts (zero remaining kiln memberships)...");
  const allUsers = await db.select().from(schema.users);
  const remainingMemberships = await db.select().from(schema.kilnMemberships);
  const usersWithMembership = new Set(remainingMemberships.map((m) => m.userId));
  const orphanedUsers = allUsers.filter((u) => !usersWithMembership.has(u._id));
  if (orphanedUsers.length > 0) {
    console.log(`  Found ${orphanedUsers.length} orphaned user account(s):`);
    for (const u of orphanedUsers) console.log(`    ${u._id}  ${u.name}  <${u.email}>`);
    await db.delete(schema.users).where(inArray(schema.users._id, orphanedUsers.map((u) => u._id)));
    console.log(`  Deleted ${orphanedUsers.length} orphaned user account(s).`);
  } else {
    console.log("  None found.");
  }

  console.log(`\nTotal rows deleted across all tables (excluding kilns/memberships/users): ${totalRows}`);

  console.log("\nVerifying: only JVS Bricks should remain...");
  const remainingKilns = await db.select().from(schema.kilns);
  console.log(`  Kilns remaining: ${remainingKilns.map((k) => k.name).join(", ")}`);
  const stillHasOthers = remainingKilns.some((k) => k._id !== JVS_BRICKS_KILN_ID);
  if (stillHasOthers) {
    console.log("  WARNING: non-JVS-Bricks kiln(s) still present!");
  } else {
    console.log("  Confirmed — JVS Bricks is the only kiln left.");
  }

  console.log("\nCleanup complete.");
  process.exit(stillHasOthers ? 1 : 0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
