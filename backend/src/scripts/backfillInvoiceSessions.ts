// One-time backfill for invoices created before the session/
// sessionSerialNumber columns existed (see dispatchDocuments.service.ts's
// createInvoice) — those rows have session=NULL, so formatInvoiceNumber
// falls back to the older, non-uniform `INV-{sequenceNumber}` display
// instead of the `{kilnPrefix}/{session}/{sessionSerialNumber}` format
// every invoice created since then gets. This assigns each NULL-session
// invoice its session (the Indian financial year its own invoiceDate
// falls in) and a sessionSerialNumber continuing from that session's
// current MAX (same "continue from MAX, never renumber what's already
// assigned" convention as backfillSequenceNumbers.ts — an already-numbered
// invoice may already be in a customer's hands with that printed number,
// so this only fills the gap, never reassigns an existing one).
//
// Idempotent — safe to re-run: only rows with session IS NULL are ever
// touched, so a second run finds nothing left to do.
//
// Run with: npx tsx src/scripts/backfillInvoiceSessions.ts
import "dotenv/config";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { kilns, invoices } from "../db/schema";
import { financialYearSession } from "../services/dispatchDocuments.service";

async function main() {
  const allKilns = await db.select().from(kilns);
  console.log(`Found ${allKilns.length} kiln(s).`);

  let totalBackfilled = 0;

  for (const kiln of allKilns) {
    const missing = await db
      .select({ _id: invoices._id, invoiceDate: invoices.invoiceDate, createdAt: invoices.createdAt })
      .from(invoices)
      .where(and(eq(invoices.kilnId, kiln._id), isNull(invoices.session)))
      .orderBy(asc(invoices.invoiceDate), asc(invoices.createdAt));

    if (missing.length === 0) continue;

    const sessionNext = new Map<string, number>();

    for (const row of missing) {
      const session = financialYearSession(row.invoiceDate ?? row.createdAt ?? new Date());
      if (!sessionNext.has(session)) {
        const maxRow = (
          await db
            .select({ max: sql<number | null>`max(${invoices.sessionSerialNumber})` })
            .from(invoices)
            .where(and(eq(invoices.kilnId, kiln._id), eq(invoices.session, session)))
        )[0];
        sessionNext.set(session, (maxRow?.max ?? 0) + 1);
      }

      const sessionSerialNumber = sessionNext.get(session)!;
      sessionNext.set(session, sessionSerialNumber + 1);

      await db.update(invoices).set({ session, sessionSerialNumber }).where(eq(invoices._id, row._id));
    }

    totalBackfilled += missing.length;
    const summary = [...sessionNext.entries()].map(([session, next]) => `${session} (up to #${next - 1})`).join(", ");
    console.log(`Kiln ${kiln._id} (${kiln.name}): backfilled ${missing.length} invoice(s) — ${summary}`);
  }

  console.log(`\nBackfilled ${totalBackfilled} invoice(s) total.`);

  console.log("\nVerifying: zero NULL session rows should remain...");
  const remaining = (await db.select({ count: sql<number>`count(*)` }).from(invoices).where(isNull(invoices.session)))[0]?.count ?? 0;
  if (remaining > 0) {
    console.log(`  STILL ${remaining} row(s) with NULL session.`);
  } else {
    console.log("  All clear — zero NULL session rows.");
  }

  console.log("\nBackfill complete.");
  process.exit(remaining > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
