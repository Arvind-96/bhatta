import { totalFuelConsumed } from "./fuelLog.service";
import { totalA1Output } from "./chamberGrading.service";

const HIGH_CONSUMPTION_ALERT_RATIO = 1.2; // 20% above the trailing baseline

// The core cost metric bhatta owners actually track: kg of fuel burned per
// 1,000 A-1 bricks produced. Comparing the recent window against a longer
// trailing baseline is what catches "someone's overfeeding coal" or "a
// leak is wasting heat" before it eats a whole season's margin.
export async function fuelEfficiency(kilnId: string, days = 7, baselineDays = 30) {
  const recentSince = new Date();
  recentSince.setDate(recentSince.getDate() - days);
  const baselineSince = new Date();
  baselineSince.setDate(baselineSince.getDate() - baselineDays);

  const [recentFuel, recentA1, baselineFuel, baselineA1] = await Promise.all([
    totalFuelConsumed(kilnId, recentSince),
    totalA1Output(kilnId, recentSince),
    totalFuelConsumed(kilnId, baselineSince),
    totalA1Output(kilnId, baselineSince),
  ]);

  const recentKgPer1000 = recentA1 > 0 ? (recentFuel / recentA1) * 1000 : null;
  const baselineKgPer1000 = baselineA1 > 0 ? (baselineFuel / baselineA1) * 1000 : null;

  const highConsumptionAlert =
    recentKgPer1000 != null && baselineKgPer1000 != null && recentKgPer1000 > baselineKgPer1000 * HIGH_CONSUMPTION_ALERT_RATIO;

  return {
    days,
    baselineDays,
    recentFuelKg: recentFuel,
    recentA1Bricks: recentA1,
    recentKgPer1000: recentKgPer1000 != null ? Math.round(recentKgPer1000 * 10) / 10 : null,
    baselineKgPer1000: baselineKgPer1000 != null ? Math.round(baselineKgPer1000 * 10) / 10 : null,
    highConsumptionAlert,
  };
}
