// Corrects a mistake in the earlier backfillInvoiceSessions.ts run:
// that script assigned session/sessionSerialNumber only to the invoices
// that had NULL, appending them AFTER the already-numbered ones —  but
// the NULL-session invoices were actually the OLDEST ones (created
// before the session feature existed), so the result was newer invoices
// carrying lower numbers than older ones, e.g. an invoice from Sept 1
// ending up numbered #1 while one from Aug 20 was #36. Printed/displayed
// in date order, this looked like the sequence resetting partway through
// ("...36, 1, 2, 3...").
//
// This script instead performs a full renumbering: for every (kilnId,
// session) group, every invoice's sessionSerialNumber is reassigned in
// true chronological order (invoiceDate ascending, createdAt ascending
// as the same-day tiebreaker) as 1, 2, 3, ..., N — a real, continuous,
// gap-free, duplicate-free sequence with no invoice out of order. No
// unique index exists on (kilnId, session, sessionSerialNumber) (only
// the older, unrelated sequenceNumber field has one), so this can freely
// renumber without any temporary-collision two-pass dance.
//
// Idempotent — re-running always converges to the same correct order.
//
// Run with: npx tsx src/scripts/renumberInvoiceSessions.ts
import "dotenv/config";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { kilns, invoices } from "../db/schema";

async function main() {
  const allKilns = await db.select().from(kilns);
  console.log(`Found ${allKilns.length} kiln(s).`);

  let totalRenumbered = 0;

  for (const kiln of allKilns) {
    const rows = await db
      .select({ _id: invoices._id, session: invoices.session, invoiceDate: invoices.invoiceDate, createdAt: invoices.createdAt })
      .from(invoices)
      .where(and(eq(invoices.kilnId, kiln._id), isNotNull(invoices.session)))
      .orderBy(asc(invoices.invoiceDate), asc(invoices.createdAt));

    if (rows.length === 0) continue;

    const bySession = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = bySession.get(row.session!) ?? [];
      list.push(row);
      bySession.set(row.session!, list);
    }

    for (const [session, sessionRows] of bySession) {
      let changed = 0;
      for (let i = 0; i < sessionRows.length; i++) {
        const correctNumber = i + 1;
        await db.update(invoices).set({ sessionSerialNumber: correctNumber }).where(eq(invoices._id, sessionRows[i]._id));
        changed += 1;
      }
      totalRenumbered += changed;
      console.log(`Kiln ${kiln._id} (${kiln.name}), session "${session}": renumbered ${changed} invoice(s) to 1–${sessionRows.length}, in true chronological order.`);
    }
  }

  console.log(`\nRenumbered ${totalRenumbered} invoice(s) total.`);
  console.log("\nRenumbering complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Renumbering failed:", err);
  process.exit(1);
});
