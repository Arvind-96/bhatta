// One-time backfill for JVS Bricks' existing salary-slip history (July,
// August, September 2026) after adding the carried-forward-balance fix
// (see salary.service.ts's generateSalarySlip): every existing slip was
// generated before that fix, so none of them ever posted a SALARY ledger
// entry, and none of them accounted for a prior month's overdrawn
// balance. Regenerating in chronological order lets each month's
// carriedForward correctly pick up the freshly-posted SALARY entry from
// the month before it.
//
// Run with: npx tsx src/scripts/regenerateSalaryHistory.ts
import "dotenv/config";
import { generateForKiln } from "../services/salary.service";

const KILN_ID = "6a7741541033c0f439c33f9f"; // JVS Bricks
const MONTHS = ["2026-07", "2026-08", "2026-09"];

async function main() {
  for (const month of MONTHS) {
    const result = await generateForKiln(KILN_ID, month);
    console.log(`${month}:`, JSON.stringify(result));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Regeneration failed:", err);
  process.exit(1);
});
