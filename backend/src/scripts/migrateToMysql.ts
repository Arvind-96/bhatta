// One-off SQLite → MySQL data migration. Reads every row from the old
// better-sqlite3 file (raw SQL, bypassing Drizzle's schema layer entirely
// since the old SQLite-dialect schema definitions no longer exist in this
// codebase) and inserts it into the new MySQL database via the app's
// current (MySQL-dialect) Drizzle schema, converting SQLite's 0/1 integers
// to real booleans and epoch-ms integers to JS Date objects per column,
// using the exact column-type knowledge from the schema conversion itself
// (see db/schema/*.ts) rather than fragile runtime type-guessing.
//
// Usage: SQLITE_SOURCE_PATH=/path/to/old/bhatta.db npx tsx src/scripts/migrateToMysql.ts
// Requires DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME env vars for the
// MySQL destination (same as the app's normal .env) and a fresh MySQL
// schema already migrated there (`npx drizzle-kit migrate` first).

import Database from "better-sqlite3";
import { db } from "../db/client";
import * as schema from "../db/schema";

const SQLITE_SOURCE_PATH = process.env.SQLITE_SOURCE_PATH;
if (!SQLITE_SOURCE_PATH) {
  console.error("Set SQLITE_SOURCE_PATH to the old bhatta.db file path.");
  process.exit(1);
}

const sqlite = new Database(SQLITE_SOURCE_PATH, { readonly: true });

interface TableSpec {
  sqliteTable: string;
  drizzleTable: (typeof schema)[keyof typeof schema];
  dateCols: string[];
  boolCols?: string[];
}

const TABLES: TableSpec[] = [
  { sqliteTable: "kilns", drizzleTable: schema.kilns, dateCols: ["onboardedAt", "createdAt"] },
  { sqliteTable: "users", drizzleTable: schema.users, dateCols: ["createdAt"] },
  { sqliteTable: "kiln_memberships", drizzleTable: schema.kilnMemberships, dateCols: ["createdAt"] },
  { sqliteTable: "sync_logs", drizzleTable: schema.syncLogs, dateCols: ["createdAt"] },
  { sqliteTable: "dispatches", drizzleTable: schema.dispatches, dateCols: ["dispatchedOn", "createdAt"] },
  { sqliteTable: "stock_entries", drizzleTable: schema.stockEntries, dateCols: ["recordedOn", "createdAt"] },
  { sqliteTable: "stock_audits", drizzleTable: schema.stockAudits, dateCols: ["date", "createdAt"] },
  { sqliteTable: "stock_loading_entries", drizzleTable: schema.stockLoadingEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "expenses", drizzleTable: schema.expenses, dateCols: ["date", "createdAt"] },
  { sqliteTable: "compliance_documents", drizzleTable: schema.complianceDocuments, dateCols: ["issueDate", "expiryDate", "createdAt"] },
  { sqliteTable: "machines", drizzleTable: schema.machines, dateCols: ["createdAt"], boolCols: ["active"] },
  { sqliteTable: "machine_fuel_logs", drizzleTable: schema.machineFuelLogs, dateCols: ["date", "createdAt"] },
  { sqliteTable: "machine_maintenance_logs", drizzleTable: schema.machineMaintenanceLogs, dateCols: ["date", "createdAt"] },
  { sqliteTable: "inventory_items", drizzleTable: schema.inventoryItems, dateCols: ["createdAt"] },
  { sqliteTable: "supplied_items", drizzleTable: schema.suppliedItems, dateCols: ["date", "createdAt"] },
  { sqliteTable: "fuel_types", drizzleTable: schema.fuelTypes, dateCols: ["createdAt"] },
  { sqliteTable: "fuel_purchases", drizzleTable: schema.fuelPurchases, dateCols: ["date", "createdAt"] },
  { sqliteTable: "fuel_logs", drizzleTable: schema.fuelLogs, dateCols: ["date", "createdAt"] },
  { sqliteTable: "kiln_vehicles", drizzleTable: schema.kilnVehicles, dateCols: ["createdAt"] },
  { sqliteTable: "vehicle_diesel_entries", drizzleTable: schema.vehicleDieselEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "people", drizzleTable: schema.people, dateCols: ["firingShiftAnchorDate", "createdAt"], boolCols: ["isOfficeStaff", "active"] },
  { sqliteTable: "family_members", drizzleTable: schema.familyMembers, dateCols: ["createdAt"], boolCols: ["isWorking"] },
  { sqliteTable: "ledger_entries", drizzleTable: schema.ledgerEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "payment_receipts", drizzleTable: schema.paymentReceipts, dateCols: ["date", "createdAt"] },
  { sqliteTable: "work_entries", drizzleTable: schema.workEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "attendances", drizzleTable: schema.attendances, dateCols: ["date", "createdAt"] },
  { sqliteTable: "ghers", drizzleTable: schema.ghers, dateCols: ["cycleStartedAt", "updatedAt"] },
  { sqliteTable: "molding_entries", drizzleTable: schema.moldingEntries, dateCols: ["date", "createdAt"], boolCols: ["washedOut"] },
  { sqliteTable: "stacking_entries", drizzleTable: schema.stackingEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "stacking_vehicles", drizzleTable: schema.stackingVehicles, dateCols: ["createdAt"] },
  { sqliteTable: "chamber_gradings", drizzleTable: schema.chamberGradings, dateCols: ["date", "createdAt"] },
  { sqliteTable: "firing_shifts", drizzleTable: schema.firingShifts, dateCols: ["date", "createdAt"] },
  { sqliteTable: "fire_movement_logs", drizzleTable: schema.fireMovementLogs, dateCols: ["startedAt"] },
  { sqliteTable: "kiln_incidents", drizzleTable: schema.kilnIncidents, dateCols: ["date", "createdAt"] },
  { sqliteTable: "nikasi_entries", drizzleTable: schema.nikasiEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "loading_entries", drizzleTable: schema.loadingEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "brick_loading_entries", drizzleTable: schema.brickLoadingEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "brick_categories", drizzleTable: schema.brickCategories, dateCols: ["createdAt"] },
  { sqliteTable: "brick_production_entries", drizzleTable: schema.brickProductionEntries, dateCols: ["date", "createdAt"] },
  { sqliteTable: "production_logs", drizzleTable: schema.productionLogs, dateCols: ["producedOn", "createdAt"] },
  { sqliteTable: "wastage_logs", drizzleTable: schema.wastageLogs, dateCols: ["date", "createdAt"] },
  { sqliteTable: "salary_slips", drizzleTable: schema.salarySlips, dateCols: ["generatedAt"] },
  { sqliteTable: "lands", drizzleTable: schema.lands, dateCols: ["createdAt"] },
  { sqliteTable: "soil_trips", drizzleTable: schema.soilTrips, dateCols: ["date", "createdAt"] },
  { sqliteTable: "soil_contracts", drizzleTable: schema.soilContracts, dateCols: ["startDate", "endDate", "createdAt"] },
  { sqliteTable: "soil_arrivals", drizzleTable: schema.soilArrivals, dateCols: ["date", "createdAt"], boolCols: ["jcbUsed", "tractorUsed"] },
  { sqliteTable: "jcb_work_logs", drizzleTable: schema.jcbWorkLogs, dateCols: ["date", "createdAt"] },
];

function convertRow(row: Record<string, unknown>, spec: TableSpec): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const col of spec.dateCols) {
    if (out[col] != null) out[col] = new Date(out[col] as number);
  }
  for (const col of spec.boolCols ?? []) {
    if (out[col] != null) out[col] = !!out[col];
  }
  return out;
}

async function migrateTable(spec: TableSpec) {
  const rows = sqlite.prepare(`SELECT * FROM ${spec.sqliteTable}`).all() as Record<string, unknown>[];
  if (rows.length === 0) {
    console.log(`${spec.sqliteTable.padEnd(28)} 0 rows (skipped)`);
    return { table: spec.sqliteTable, count: 0 };
  }
  const converted = rows.map((r) => convertRow(r, spec));
  // Chunked to stay well under MySQL's max_allowed_packet for the wider
  // tables (e.g. `people` has ~40 columns) — 200 rows/insert is safely
  // small for this app's data volumes (largest table seen: ~700-900 rows).
  const CHUNK = 200;
  for (let i = 0; i < converted.length; i += CHUNK) {
    await db.insert(spec.drizzleTable as never).values(converted.slice(i, i + CHUNK) as never);
  }
  console.log(`${spec.sqliteTable.padEnd(28)} ${rows.length} rows migrated`);
  return { table: spec.sqliteTable, count: rows.length };
}

async function main() {
  console.log(`Migrating from ${SQLITE_SOURCE_PATH} to MySQL (${process.env.DB_NAME ?? "bhatta_cloud"})...\n`);
  const results = [];
  for (const spec of TABLES) {
    results.push(await migrateTable(spec));
  }
  const total = results.reduce((sum, r) => sum + r.count, 0);
  console.log(`\nDone — ${total} total rows across ${TABLES.length} tables.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
