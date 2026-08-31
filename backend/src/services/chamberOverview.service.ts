import { listGhers } from "./gher.service";
import { stackedSinceForGher } from "./stacking.service";
import { fuelConsumedForGher } from "./fuelLog.service";
import { unloadedSinceForGher } from "./nikasi.service";

// The Firing page's chamber control panel — one call, every chamber, each
// with its current-cycle progress at whichever stage it's actually in
// (deliberately computes all three figures for every chamber regardless of
// its current status, rather than branching per-status, since a chamber
// can carry residual current-cycle numbers worth seeing even just after
// advancing — e.g. bricksLoaded stays meaningful to show right up through
// FIRING/READY/UNLOADING, not just while STACKING). Lives in its own file
// (not gher.service.ts) specifically to avoid a circular import: stacking/
// fuelLog/nikasi services all import assertGherInKiln FROM gher.service.ts,
// so gher.service.ts itself can't import back from them.
export async function chamberOverview(kilnId: string, seasonId: string) {
  const allGhers = await listGhers(kilnId);

  return Promise.all(
    allGhers.map(async (gher) => {
      const since = gher.cycleStartedAt ?? undefined;
      const [bricksLoaded, fuel, bricksUnloaded] = await Promise.all([
        stackedSinceForGher(kilnId, seasonId, gher._id, since),
        fuelConsumedForGher(kilnId, seasonId, gher._id, since),
        unloadedSinceForGher(kilnId, seasonId, gher._id, since),
      ]);
      return { gher, bricksLoadedThisCycle: bricksLoaded, fuelThisCycle: fuel, bricksUnloadedThisCycle: bricksUnloaded };
    })
  );
}
