import "dotenv/config";
import { randomUUID } from "crypto";
import { insertProductionLog, insertStockEntry } from "./localDb";
import { startSyncLoop } from "./syncQueue";

const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 4000);

startSyncLoop(SYNC_INTERVAL_MS);
console.log(`[sync-engine] authenticating as ${process.env.SYNC_EMAIL}, syncing every ${SYNC_INTERVAL_MS}ms`);

// Demo generator: simulates a munshi logging production/stock at the kiln site.
// Remove this block once wired to a real local terminal UI.
if (process.env.DEMO_MODE !== "false") {
  setInterval(() => {
    insertProductionLog({
      localId: randomUUID(),
      batchNumber: `B-${Math.floor(Math.random() * 900 + 100)}`,
      bricksCount: Math.floor(Math.random() * 400 + 100),
      qualityGrade: Math.random() > 0.2 ? "A" : "B",
    });
  }, 6000);

  setInterval(() => {
    insertStockEntry({
      localId: randomUUID(),
      type: Math.random() > 0.5 ? "RAW_MATERIAL" : "FINISHED_GOODS",
      itemName: Math.random() > 0.5 ? "Coal" : "Finished Bricks",
      quantity: Math.floor(Math.random() * 1000),
    });
  }, 9000);
}
