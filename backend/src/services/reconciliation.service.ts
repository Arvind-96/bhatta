import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { kilns } from "../db/schema";
import { totalMolded, damagedMoldedSince } from "./molding.service";
import { totalStacked } from "./stacking.service";
import { totalWastage } from "./wastage.service";
import { totalA1Output } from "./chamberGrading.service";
import { totalDispatchedSince } from "./dispatch.service";
import { getStockSnapshot } from "./stock.service";
import { totalNikasiDamage } from "./nikasi.service";

const MISMATCH_ALERT_THRESHOLD = 0.05; // 5%
const YARD_WARNING_THRESHOLD = 0.85; // 85% full
const EPOCH = new Date(0);

// The classic bhatta dispute: a pathaiwal claims they molded 1,00,000
// bricks, but only 90,000 show up stacked in the kiln. Some of that gap is
// legitimate (reported wastage — rain, transit breakage); anything beyond
// that is unexplained and worth flagging before it's written off as normal
// loss. fieldStock is what *should* still be sitting in the field awaiting
// stacking — a large negative number means more got stacked/wasted than
// was ever molded, which is impossible and points at a counting error.
// The same fieldStock figure doubles as the drying-yard occupancy check:
// once it nears the yard's brick capacity, there's nowhere to put freshly
// molded bricks until stacking catches up.
export async function reconcileSoilToKiln(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [molded, stacked, wastage, kiln] = await Promise.all([
    totalMolded(kilnId, since),
    totalStacked(kilnId, since),
    totalWastage(kilnId, since, "KACCHI_BRICK"),
    db.select().from(kilns).where(eq(kilns._id, kilnId)).get(),
  ]);

  const accountedFor = stacked.bricksCount + stacked.damageCount + wastage;
  const fieldStock = molded - accountedFor;
  const mismatch = molded > 0 ? Math.abs(fieldStock) / molded : 0;

  const yardCapacityBricks = kiln?.yardCapacityBricks;
  const yardUtilizationPercent = yardCapacityBricks
    ? Math.round((fieldStock / yardCapacityBricks) * 1000) / 10
    : null;

  return {
    days,
    totalMolded: molded,
    totalStacked: stacked.bricksCount,
    totalDamaged: stacked.damageCount,
    totalWastage: wastage,
    fieldStock,
    mismatchPercent: Math.round(mismatch * 1000) / 10,
    alert: fieldStock < 0 || mismatch > MISMATCH_ALERT_THRESHOLD,
    yardCapacityBricks: yardCapacityBricks ?? null,
    yardUtilizationPercent,
    yardFullWarning: yardUtilizationPercent != null && yardUtilizationPercent / 100 >= YARD_WARNING_THRESHOLD,
  };
}

// The "blind dispatch" check: A-1 bricks produced should equal what's been
// sold plus what's still sitting in the godown. If munim and driver collude
// to move stock out without ever logging a Dispatch, this is where it
// shows up — production and warehouse counts stop adding up to what was
// actually made, even though no single record looks wrong on its own.
export async function reconcileFinishedGoods(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [produced, dispatched, snapshot] = await Promise.all([
    totalA1Output(kilnId, since),
    totalDispatchedSince(kilnId, since),
    getStockSnapshot(kilnId),
  ]);

  const currentStock = snapshot.find((s) => s.itemName === "Bricks (A-1 Grade)")?.quantity ?? 0;
  const unaccounted = produced - dispatched - currentStock;
  const mismatch = produced > 0 ? Math.abs(unaccounted) / produced : 0;

  return {
    days,
    totalA1Produced: produced,
    totalDispatched: dispatched,
    currentStock,
    unaccounted,
    mismatchPercent: Math.round(mismatch * 1000) / 10,
    alert: mismatch > MISMATCH_ALERT_THRESHOLD,
  };
}

// The Overview dashboard's raw-brick-stock and combined-damage figures —
// all-time sums (not a rolling window like reconcileSoilToKiln's 30-day
// mismatch check), since "how many raw bricks are there right now" and
// "total damage so far" are current-state numbers, not a recent-activity
// rate. rawBrickStock reuses the exact same formula as fieldStock above
// (molded minus stacked, stacking damage, and reported wastage) — bricks
// molded but not yet loaded into a chamber. Not clamped at zero: a
// negative figure is itself a data-integrity signal worth seeing, same as
// reconcileSoilToKiln's own alert.
export async function dashboardStockSummary(kilnId: string) {
  const [molded, stacked, wastage, moldingDamage, nikasiDamage] = await Promise.all([
    totalMolded(kilnId, EPOCH),
    totalStacked(kilnId, EPOCH),
    totalWastage(kilnId, EPOCH, "KACCHI_BRICK"),
    damagedMoldedSince(kilnId, EPOCH),
    totalNikasiDamage(kilnId, EPOCH),
  ]);

  const rawBrickStock = molded - (stacked.bricksCount + stacked.damageCount + wastage);

  return {
    rawBrickStock,
    totalDamage: moldingDamage + stacked.damageCount + nikasiDamage,
    damageBreakdown: {
      molding: moldingDamage,
      stacking: stacked.damageCount,
      nikasi: nikasiDamage,
    },
  };
}
