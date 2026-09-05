// One-time data cleanup: deleteSoilContract/deleteSandContract used to
// leave soilTrips/soilArrivals/jcbWorkLogs/sandDeliveries pointing at a
// contractId that no longer exists, for any contract deleted before that
// fix existed. The money was never at risk (each row's own amount/ledger
// entries stand independently of the contract row) — this only clears the
// now-dangling reference so "which contract" resolves to "none" instead of
// silently failing to resolve.
//
// Idempotent — safe to re-run: only touches rows whose contractId doesn't
// match any existing contract, so a second run finds (and reports) zero.
//
// Run with: npx tsx src/scripts/cleanOrphanedContractReferences.ts
import "dotenv/config";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { soilTrips, soilArrivals, jcbWorkLogs, soilContracts, sandDeliveries, sandContracts } from "../db/schema";

async function cleanTable(
  label: string,
  table: typeof soilTrips | typeof soilArrivals | typeof jcbWorkLogs | typeof sandDeliveries,
  validContractIds: string[]
) {
  const orphaned =
    validContractIds.length > 0
      ? await db.select({ _id: table._id }).from(table).where(and(isNotNull(table.contractId), notInArray(table.contractId, validContractIds)))
      : await db.select({ _id: table._id }).from(table).where(isNotNull(table.contractId));
  if (orphaned.length > 0) {
    for (const row of orphaned) {
      await db.update(table).set({ contractId: null }).where(eq(table._id, row._id));
    }
  }
  console.log(`${label}: ${orphaned.length} orphaned row(s) cleared`);
}

async function main() {
  const [soilContractRows, sandContractRows] = await Promise.all([
    db.select({ _id: soilContracts._id }).from(soilContracts),
    db.select({ _id: sandContracts._id }).from(sandContracts),
  ]);
  const validSoilContractIds = soilContractRows.map((c) => c._id);
  const validSandContractIds = sandContractRows.map((c) => c._id);

  await cleanTable("soil_trips", soilTrips, validSoilContractIds);
  await cleanTable("soil_arrivals", soilArrivals, validSoilContractIds);
  await cleanTable("jcb_work_logs", jcbWorkLogs, validSoilContractIds);
  await cleanTable("sand_deliveries", sandDeliveries, validSandContractIds);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
