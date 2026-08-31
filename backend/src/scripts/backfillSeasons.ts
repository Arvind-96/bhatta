// One-time backfill for the Bhatta Season migration. Idempotent — safe to
// re-run: a kiln that already has a season row is skipped entirely, and
// each table UPDATE only touches rows where seasonId IS NULL.
//
// For every kiln with no seasons row yet: creates one "Season 1" row
// (isCurrent = true, startDate = the kiln's own createdAt — everything
// that happened before this migration existed is retroactively "Season
// 1"), then stamps every existing NULL seasonId across all 37
// transactional tables with that season's id. Finishes with a verification
// pass confirming zero NULL seasonId rows remain anywhere.
//
// Run with: npx tsx src/scripts/backfillSeasons.ts
import { randomUUID } from "crypto";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  kilns,
  seasons,
  attendances,
  ledgerEntries,
  paymentReceipts,
  workEntries,
  brickLoadingEntries,
  brickProductionEntries,
  chamberGradings,
  fireMovementLogs,
  firingShifts,
  kilnIncidents,
  loadingEntries,
  moldingEntries,
  nikasiEntries,
  productionLogs,
  stackingEntries,
  wastageLogs,
  challans,
  dispatches,
  expenses,
  gatePasses,
  invoices,
  stockAudits,
  stockEntries,
  stockLoadingEntries,
  jcbWorkLogs,
  soilArrivals,
  soilTrips,
  sandDeliveries,
  fuelLogs,
  fuelPurchases,
  machineFuelLogs,
  machineInstallmentPayments,
  machineMaintenanceLogs,
  suppliedItems,
  vehicleDieselEntries,
  salarySlips,
  supplierInvoices,
} from "../db/schema";

const TRANSACTIONAL_TABLES = [
  ["attendances", attendances],
  ["ledgerEntries", ledgerEntries],
  ["paymentReceipts", paymentReceipts],
  ["workEntries", workEntries],
  ["brickLoadingEntries", brickLoadingEntries],
  ["brickProductionEntries", brickProductionEntries],
  ["chamberGradings", chamberGradings],
  ["fireMovementLogs", fireMovementLogs],
  ["firingShifts", firingShifts],
  ["kilnIncidents", kilnIncidents],
  ["loadingEntries", loadingEntries],
  ["moldingEntries", moldingEntries],
  ["nikasiEntries", nikasiEntries],
  ["productionLogs", productionLogs],
  ["stackingEntries", stackingEntries],
  ["wastageLogs", wastageLogs],
  ["challans", challans],
  ["dispatches", dispatches],
  ["expenses", expenses],
  ["gatePasses", gatePasses],
  ["invoices", invoices],
  ["stockAudits", stockAudits],
  ["stockEntries", stockEntries],
  ["stockLoadingEntries", stockLoadingEntries],
  ["jcbWorkLogs", jcbWorkLogs],
  ["soilArrivals", soilArrivals],
  ["soilTrips", soilTrips],
  ["sandDeliveries", sandDeliveries],
  ["fuelLogs", fuelLogs],
  ["fuelPurchases", fuelPurchases],
  ["machineFuelLogs", machineFuelLogs],
  ["machineInstallmentPayments", machineInstallmentPayments],
  ["machineMaintenanceLogs", machineMaintenanceLogs],
  ["suppliedItems", suppliedItems],
  ["vehicleDieselEntries", vehicleDieselEntries],
  ["salarySlips", salarySlips],
  ["supplierInvoices", supplierInvoices],
] as const;

async function main() {
  const allKilns = await db.select().from(kilns);
  console.log(`Found ${allKilns.length} kiln(s).`);

  for (const kiln of allKilns) {
    const existing = await db.select().from(seasons).where(eq(seasons.kilnId, kiln._id));
    if (existing.length > 0) {
      console.log(`Kiln ${kiln._id} (${kiln.name}) already has ${existing.length} season(s) — skipping.`);
      continue;
    }

    const startDate = kiln.createdAt ?? new Date(0);
    const seasonId = randomUUID();
    await db.insert(seasons).values({
      _id: seasonId,
      kilnId: kiln._id,
      label: "Season 1",
      startDate,
      isCurrent: true,
    });
    console.log(`Kiln ${kiln._id} (${kiln.name}): created season "${seasonId}" ("Season 1", startDate ${startDate.toISOString()}).`);

    for (const [name, table] of TRANSACTIONAL_TABLES) {
      await db.update(table).set({ seasonId }).where(and(eq(table.kilnId, kiln._id), isNull(table.seasonId)));
      console.log(`  ${name}: stamped`);
    }
  }

  console.log("\nVerifying: every table should now have zero NULL seasonId rows...");
  let anyNull = false;
  for (const [name, table] of TRANSACTIONAL_TABLES) {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(table).where(isNull(table.seasonId));
    const count = rows[0]?.count ?? 0;
    if (count > 0) {
      anyNull = true;
      console.log(`  ${name}: ${count} row(s) STILL NULL`);
    }
  }
  if (!anyNull) console.log("  All clear — zero NULL seasonId rows across every table.");

  console.log("\nBackfill complete.");
  process.exit(anyNull ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
