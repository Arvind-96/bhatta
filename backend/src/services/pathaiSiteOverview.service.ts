import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { pathaiSites, moldingEntries, soilArrivals, stackingEntries, saltUsageLogs } from "../db/schema";

// Kept in its own file, same reasoning as chamberOverview.service.ts —
// this needs data from molding/soilArrival/stacking, each of which (like
// the gher-adjacent services) could plausibly import back from
// pathaiSite.service.ts (for assertPathaiSiteInKiln) — living outside all
// of them avoids any risk of a cycle.
//
// soilArrivals is the live "trolleys delivered" entity (the Soil page's
// day-to-day workflow) — soilTrips is an older, unused-by-the-frontend
// table and is deliberately not read here.
export async function pathaiSiteOverview(kilnId: string, seasonId: string) {
  const sites = await db.select().from(pathaiSites).where(and(eq(pathaiSites.kilnId, kilnId), eq(pathaiSites.active, true)));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [allMolding, allArrivals, allTransport, allSalt] = await Promise.all([
    db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), eq(moldingEntries.seasonId, seasonId))),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.seasonId, seasonId))),
    db.select().from(stackingEntries).where(and(eq(stackingEntries.kilnId, kilnId), eq(stackingEntries.seasonId, seasonId), eq(stackingEntries.stage, "TRANSPORT"))),
    db.select().from(saltUsageLogs).where(eq(saltUsageLogs.kilnId, kilnId)),
  ]);

  return sites.map((site) => {
    const molded = allMolding.filter((m) => m.siteId === site._id && !m.washedOut);
    const arrivals = allArrivals.filter((a) => a.siteId === site._id);
    const transported = allTransport.filter((s) => s.siteId === site._id);
    const salt = allSalt.filter((s) => s.siteId === site._id);

    const totalBricksProduced = molded.reduce((sum, m) => sum + m.bricksCount, 0);
    const totalTrolleysDelivered = arrivals.reduce((sum, a) => sum + (a.trolleyCount ?? 0), 0);
    const totalBricksTransportedAway = transported.reduce((sum, s) => sum + s.bricksCount, 0);
    const totalSaltUsedKg = salt.reduce((sum, s) => sum + s.quantityKg, 0);

    const bricksToday = molded.filter((m) => m.date && m.date >= startOfDay).reduce((sum, m) => sum + m.bricksCount, 0);
    const bricksThisWeek = molded.filter((m) => m.date && m.date >= weekAgo).reduce((sum, m) => sum + m.bricksCount, 0);

    return {
      site,
      totalBricksProduced,
      totalTrolleysDelivered,
      totalBricksTransportedAway,
      totalSaltUsedKg,
      currentRawStock: Math.max(0, totalBricksProduced - totalBricksTransportedAway),
      bricksPerTrolley: totalTrolleysDelivered > 0 ? Math.round((totalBricksProduced / totalTrolleysDelivered) * 10) / 10 : null,
      bricksToday,
      bricksThisWeek,
    };
  });
}
