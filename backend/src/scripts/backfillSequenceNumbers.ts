// One-time backfill for historical Invoices, Gate Passes, and Challans
// (including invoices created via "New payment receipt") that were saved
// with their Serial Number field left blank — sequenceNumber is nullable
// by design (see the schema comment on challans/gatePasses/invoices) so
// the admin can clear the suggested number and leave a document unnumbered
// on purpose. This assigns real numbers to every row that's still NULL,
// scoped per (kilnId, seasonId) (numbering resets each season, same as
// live document creation), continuing from that season's current
// MAX(sequenceNumber) and stepping through the NULL rows in the exact
// order they were created (createdAt ascending) — the same "time of
// creation" ordering live document creation already uses, and the same
// MAX-based-not-COUNT-based convention every other document sequence
// number in this app follows (see dispatchDocuments.service.ts's
// generateSequenceNumber). Never touches a row that already has a number.
//
// Idempotent — safe to re-run: only rows with sequenceNumber IS NULL are
// ever touched, so a second run finds nothing left to do.
//
// Run with: npx tsx src/scripts/backfillSequenceNumbers.ts
import "dotenv/config";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { kilns, seasons, challans, gatePasses, invoices } from "../db/schema";

const DOCUMENT_TABLES = [
  ["challans", challans],
  ["gatePasses", gatePasses],
  ["invoices", invoices],
] as const;

async function main() {
  const allKilns = await db.select().from(kilns);
  console.log(`Found ${allKilns.length} kiln(s).`);

  let totalBackfilled = 0;

  for (const kiln of allKilns) {
    const kilnSeasons = await db.select().from(seasons).where(eq(seasons.kilnId, kiln._id));
    // A kiln pre-dating the Season feature has no seasons row at all —
    // sequenceNumber's unique index is (kilnId, seasonId, sequenceNumber),
    // and every document row's own seasonId is nullable, so NULL-seasonId
    // documents form their own implicit "season" scope. Represent that
    // case as a single null-label entry so the loop below still covers
    // those rows.
    const seasonScopes: { id: string | null; label: string }[] =
      kilnSeasons.length > 0 ? kilnSeasons.map((s) => ({ id: s._id, label: s.label })) : [{ id: null, label: "(no season)" }];

    for (const scope of seasonScopes) {
      for (const [name, table] of DOCUMENT_TABLES) {
        const seasonCondition = scope.id ? eq(table.seasonId, scope.id) : isNull(table.seasonId);

        const maxRow = (await db
          .select({ max: sql<number | null>`max(${table.sequenceNumber})` })
          .from(table)
          .where(and(eq(table.kilnId, kiln._id), seasonCondition)))[0];
        let next = (maxRow?.max ?? 0) + 1;

        const missing = await db
          .select({ _id: table._id, createdAt: table.createdAt })
          .from(table)
          .where(and(eq(table.kilnId, kiln._id), seasonCondition, isNull(table.sequenceNumber)))
          .orderBy(asc(table.createdAt));

        if (missing.length === 0) continue;

        for (const row of missing) {
          await db.update(table).set({ sequenceNumber: next }).where(eq(table._id, row._id));
          next += 1;
        }

        totalBackfilled += missing.length;
        console.log(
          `Kiln ${kiln._id} (${kiln.name}), season "${scope.label}": ${name} — backfilled ${missing.length} row(s), numbers ${
            next - missing.length
          }–${next - 1}.`
        );
      }
    }
  }

  console.log(`\nBackfilled ${totalBackfilled} document(s) total.`);

  console.log("\nVerifying: every table should now have zero NULL sequenceNumber rows...");
  let anyNull = false;
  for (const [name, table] of DOCUMENT_TABLES) {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(table).where(isNull(table.sequenceNumber));
    const count = rows[0]?.count ?? 0;
    if (count > 0) {
      anyNull = true;
      console.log(`  ${name}: ${count} row(s) STILL NULL`);
    }
  }
  if (!anyNull) console.log("  All clear — zero NULL sequenceNumber rows across challans/gatePasses/invoices.");

  console.log("\nBackfill complete.");
  process.exit(anyNull ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
