import {
  getUnsyncedChanges,
  markProductionSynced,
  markStockSynced,
} from "./localDb";
import { pushChangesToCloud, type SyncChange } from "./cloudClient";

// Offline-first: local writes always succeed immediately (see localDb.ts).
// This loop opportunistically flushes unsynced rows to the cloud and only
// marks them synced once the cloud confirms — safe to retry indefinitely
// after a connectivity drop, since local_id is the idempotency key.
export async function runSyncCycle() {
  const { production, stock } = getUnsyncedChanges();
  if (production.length === 0 && stock.length === 0) return;

  const changes: SyncChange[] = [
    ...production.map((row) => ({
      entityType: "production" as const,
      localId: row.local_id,
      payload: {
        batchNumber: row.batch_number,
        bricksCount: row.bricks_count,
        qualityGrade: row.quality_grade,
      },
    })),
    ...stock.map((row) => ({
      entityType: "stock" as const,
      localId: row.local_id,
      payload: {
        type: row.type,
        itemName: row.item_name,
        quantity: row.quantity,
        unit: row.unit,
      },
    })),
  ];

  try {
    const result = await pushChangesToCloud(changes);
    markProductionSynced(production.map((r) => r.local_id));
    markStockSynced(stock.map((r) => r.local_id));
    console.log(`[sync] pushed ${result.applied} change(s) to cloud`);
  } catch (err) {
    console.warn("[sync] cloud unreachable, will retry:", (err as Error).message);
  }
}

export function startSyncLoop(intervalMs: number) {
  runSyncCycle();
  return setInterval(runSyncCycle, intervalMs);
}
