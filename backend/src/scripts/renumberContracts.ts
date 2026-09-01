// One-time backfill: Soil/Sand/Land-Lease contract numbers used to be an
// opaque timestamp+random string (e.g. "LL-MTI0LCHB-1JFA"), inconsistent
// with the clean sequential serials used everywhere else in the app
// (Landowner/Sand Contractor/Land Lease people, Sale/Purchase Orders).
// generateContractNumber() in each contract service now produces
// "{PREFIX}-{n}" for new contracts; this script renumbers existing ones
// the same way, per kiln, ordered by creation time.
//
// Renumbering an existing contract's stored contractNumber does leave any
// already-written ledger reason text (e.g. "Advance for soil contract
// SC-M3X8-9F2K") pointing at the old number — accepted here since these
// are internal reference numbers, not a legally-relevant printed document
// like an invoice, so nothing external ever depended on the old value.
//
// Safe to re-run: contracts already in the "{PREFIX}-{n}" shape for their
// kiln just get reassigned the same number they already have.
//
// Run with: npx tsx src/scripts/renumberContracts.ts
import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { soilContracts, sandContracts, landLeaseContracts, kilns } from "../db/schema";

async function renumberSoilContracts() {
  const allKilns = await db.select({ _id: kilns._id }).from(kilns);
  let updated = 0;
  for (const kiln of allKilns) {
    const rows = await db.select({ _id: soilContracts._id }).from(soilContracts).where(eq(soilContracts.kilnId, kiln._id)).orderBy(asc(soilContracts.createdAt));
    for (let i = 0; i < rows.length; i++) {
      await db.update(soilContracts).set({ contractNumber: `SC-${i + 1}` }).where(eq(soilContracts._id, rows[i]!._id));
      updated++;
    }
  }
  console.log(`soil_contracts: ${updated} row(s) renumbered`);
}

async function renumberSandContracts() {
  const allKilns = await db.select({ _id: kilns._id }).from(kilns);
  let updated = 0;
  for (const kiln of allKilns) {
    const rows = await db.select({ _id: sandContracts._id }).from(sandContracts).where(eq(sandContracts.kilnId, kiln._id)).orderBy(asc(sandContracts.createdAt));
    for (let i = 0; i < rows.length; i++) {
      await db.update(sandContracts).set({ contractNumber: `SD-${i + 1}` }).where(eq(sandContracts._id, rows[i]!._id));
      updated++;
    }
  }
  console.log(`sand_contracts: ${updated} row(s) renumbered`);
}

async function renumberLandLeaseContracts() {
  const allKilns = await db.select({ _id: kilns._id }).from(kilns);
  let updated = 0;
  for (const kiln of allKilns) {
    const rows = await db.select({ _id: landLeaseContracts._id }).from(landLeaseContracts).where(eq(landLeaseContracts.kilnId, kiln._id)).orderBy(asc(landLeaseContracts.createdAt));
    for (let i = 0; i < rows.length; i++) {
      await db.update(landLeaseContracts).set({ contractNumber: `LL-${i + 1}` }).where(eq(landLeaseContracts._id, rows[i]!._id));
      updated++;
    }
  }
  console.log(`land_lease_contracts: ${updated} row(s) renumbered`);
}

async function main() {
  await renumberSoilContracts();
  await renumberSandContracts();
  await renumberLandLeaseContracts();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
