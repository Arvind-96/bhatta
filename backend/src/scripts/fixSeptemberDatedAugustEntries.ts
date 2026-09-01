// Fixes 3 ledger entries with a likely wrong-month date-entry mistake:
// all 3 were typed on 2026-09-01 in the same batch as a run of clearly
// August-dated weekly kharchi/advance entries (same descriptions, same
// person, same session), but landed on a September date instead —
// confirmed with the admin before running this. Moves each to the same
// day-of-month in August (the most likely slip: correct day, wrong month
// picked), then regenerates August's salary slips so the corrected
// figures show immediately.
//
// Run with: npx tsx src/scripts/fixSeptemberDatedAugustEntries.ts
import "dotenv/config";
import { updateLedgerEntry } from "../services/ledger.service";
import { generateForKiln } from "../services/salary.service";

const KILN_ID = "6a7741541033c0f439c33f9f"; // JVS Bricks

const FIXES: { id: string; label: string; newDate: Date }[] = [
  { id: "4dffd68d-0888-4aea-84e8-2c09c1a532f9", label: "Nainsukh — ₹1,620 Advance/Peshgi: Sep 8 -> Aug 8", newDate: new Date("2026-08-08") },
  { id: "27c70b13-3459-424d-9f21-6ddfc4de7b7a", label: "Nainsukh — ₹3,200 Kharchi: Sep 26 -> Aug 26", newDate: new Date("2026-08-26") },
  { id: "13040dc4-4573-4a46-85b5-a815ba0ea229", label: "Ompal — ₹5,200 Advance/Peshgi: Sep 26 -> Aug 26", newDate: new Date("2026-08-26") },
];

async function main() {
  for (const fix of FIXES) {
    await updateLedgerEntry(KILN_ID, fix.id, { date: fix.newDate });
    console.log(`Fixed: ${fix.label}`);
  }

  const result = await generateForKiln(KILN_ID, "2026-08");
  console.log("Regenerated August slips:", JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
