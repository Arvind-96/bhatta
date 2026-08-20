import "dotenv/config";
import { eq, isNull, isNotNull, and } from "drizzle-orm";
import { db } from "../db/client";
import { kilns, expenses } from "../db/schema";
import { findOrCreateExpenseType } from "../services/expenseType.service";

// Run once (safe to re-run — everything here is find-or-create / only
// touches rows still missing an expenseTypeId) after the expenseTypes
// migration lands. Two jobs:
//
// 1. Seed every kiln's Expense Type dropdown with the client's requested
//    default list, so it's populated before anyone logs their first
//    expense under most of these.
// 2. Backfill expenseTypeId on every pre-existing expense row (created
//    under the old fixed EXPENSE_CATEGORIES enum) so historical data stays
//    visible/browsable under the new per-type system instead of becoming
//    orphaned. Categories with no clean match in the new default list keep
//    their own preserved type name rather than being folded into an
//    unrelated one.

const DEFAULT_EXPENSE_TYPES = [
  "Electricity Bill",
  "Tubewell Water Bill",
  "Tea and Food Bill",
  "Machine Repair",
  "Electricity Repair",
  "Chanda (Donation)",
  "Diesel",
  "New Machinery Part",
  "New Electricity Part",
  "Gas Cylinder",
  "RTO",
  "Police Challan",
  "Fine",
  "Driver Reward / Inam",
  "Loading Charge",
  "Unloading Charge",
  "Accidental",
  "Medical",
  "Lakdi (Wood)",
  "Kanda (Cow Dung Cakes)",
  "New Vehicle",
  "New Machine",
  "New Electric Item",
];

// Old fixed category -> new expense type name. Anything that doesn't map
// cleanly onto one of the client's requested defaults keeps its own
// distinct, preserved name instead of being merged into an unrelated type.
const CATEGORY_TO_TYPE_NAME: Record<string, string> = {
  JCB_RENTAL: "JCB Rental",
  ROYALTY_CHALLAN: "Royalty Challan",
  TUBEWELL_DIESEL: "Diesel",
  TUBEWELL_ELECTRICITY: "Electricity Bill",
  WATER: "Tubewell Water Bill",
  MOLD_SAND: "Mold Sand",
  TARPAULIN: "Tarpaulin",
  LABOR_COLONY: "Labor Colony",
  LOCAL_CHANDA: "Chanda (Donation)",
  PETTY_CASH: "Petty Cash",
  MACHINERY_REPAIR: "Machine Repair",
  DRIVER_BHATTA: "Driver Reward / Inam",
  POLICE_CHALLAN: "Police Challan",
  COMMISSION_DALALI: "Commission / Dalali",
  TRANSIT_TAX: "Transit Tax",
  OTHER: "Other",
};

async function main() {
  const allKilns = await db.select({ _id: kilns._id, name: kilns.name }).from(kilns);

  for (const kiln of allKilns) {
    for (const name of DEFAULT_EXPENSE_TYPES) {
      await findOrCreateExpenseType(kiln._id, name);
    }
    console.log(`Seeded default expense types for kiln "${kiln.name}" (${kiln._id})`);
  }

  const legacyRows = await db
    .select()
    .from(expenses)
    .where(and(isNull(expenses.expenseTypeId), isNotNull(expenses.category)));

  let backfilled = 0;
  for (const row of legacyRows) {
    const typeName = CATEGORY_TO_TYPE_NAME[row.category!] ?? row.category!;
    const expenseType = await findOrCreateExpenseType(row.kilnId, typeName);
    await db.update(expenses).set({ expenseTypeId: expenseType._id }).where(eq(expenses._id, row._id));
    backfilled++;
  }
  console.log(`Backfilled expenseTypeId on ${backfilled} legacy expense row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
