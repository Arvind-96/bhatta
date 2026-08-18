import { randomUUID } from "crypto";
import { db } from "../db/client";
import { syncLogs } from "../db/schema";
import { createProductionLog } from "./production.service";
import { recordStockEntry } from "./stock.service";

export interface SyncChange {
  entityType: "production" | "stock";
  localId: string;
  payload: Record<string, unknown>;
}

export interface SyncPushInput {
  kilnId: string;
  changes: SyncChange[];
}

// Applies a batch of offline changes pushed by the on-site sync engine.
// Uses localId as the idempotency key so retried pushes never double-apply.
export async function applySyncPush({ kilnId, changes }: SyncPushInput) {
  const results = [];

  for (const change of changes) {
    if (change.entityType === "production") {
      const log = await createProductionLog({
        kilnId,
        batchNumber: String(change.payload.batchNumber),
        bricksCount: Number(change.payload.bricksCount),
        qualityGrade: change.payload.qualityGrade as string | undefined,
        localId: change.localId,
      });
      results.push({ localId: change.localId, cloudId: log._id, status: "applied" });
    } else if (change.entityType === "stock") {
      const entry = await recordStockEntry({
        kilnId,
        type: change.payload.type as "RAW_MATERIAL" | "FINISHED_GOODS",
        itemName: String(change.payload.itemName),
        quantity: Number(change.payload.quantity),
        unit: change.payload.unit as string | undefined,
        localId: change.localId,
      });
      results.push({ localId: change.localId, cloudId: entry._id, status: "applied" });
    }

    await db.insert(syncLogs)
      .values({
        _id: randomUUID(),
        kilnId,
        entityType: change.entityType,
        entityId: change.localId,
        action: "PUSH",
      });
  }

  return results;
}
