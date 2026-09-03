import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/client";
import { expenses, ledgerEntries, people, fuelPurchases, vehicleDieselEntries, chamberGradings } from "../../db/schema";
import { listSoilTrips } from "../soilTrip.service";
import { listSandDeliveries } from "../sandDelivery.service";
import { listInvoices } from "../dispatchDocuments.service";
import { totalBricksOf } from "../chamberGrading.service";
import { listBrickCategories } from "../brickCategory.service";
import { ReportDefinition, round2 } from "./types";

interface AverageRow extends Record<string, string | number | null> {
  metric: string;
  value: number | null;
  unit: string;
  basis: string;
}

// One row per meaningful "total ÷ total" average this kiln can compute —
// deliberately NOT the same thing as every other report's generic Total/
// Average footer (that's sum-of-a-column ÷ row-count, e.g. "average
// bill per invoice"). These are cross-column ratios: total cost ÷ total
// quantity, giving a real per-unit figure (₹/brick, ₹/kg, ₹/trolley) the
// admin asked for by name — production cost per brick, plus the same
// idea for fuel, soil, sand, sales rate, and stock value. All read-only,
// all-time by default (narrowed by the same from/to the filter bar
// already offers), season-agnostic like every other Reports-page query.
// A metric reads "—" rather than 0 when its underlying activity hasn't
// been logged at all (0 ÷ 0), so an unused module shows as "no data yet"
// instead of a misleading zero cost.
const keyAverages: ReportDefinition = {
  key: "keyAverages",
  titleKey: "reports.title.keyAverages",
  async run(kilnId, filters) {
    const from = filters.from;
    const to = filters.to;
    const dateCond = (col: any) => {
      const c = [];
      if (from) c.push(gte(col, from));
      if (to) c.push(lte(col, to));
      return c;
    };

    const [expenseRows, dueEntries, customerIds, gradingRows, fuelRows, dieselRows, soilRows, sandRows, invoiceRows, categories] = await Promise.all([
      db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), ...dateCond(expenses.date))),
      db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.direction, "DUE"), ...dateCond(ledgerEntries.date))),
      db.select({ _id: people._id }).from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "CUSTOMER"))).then((rows) => new Set(rows.map((r) => r._id))),
      db.select().from(chamberGradings).where(and(eq(chamberGradings.kilnId, kilnId), ...dateCond(chamberGradings.date))),
      db.select().from(fuelPurchases).where(and(eq(fuelPurchases.kilnId, kilnId), ...dateCond(fuelPurchases.date))),
      db.select().from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), ...dateCond(vehicleDieselEntries.date))),
      listSoilTrips(kilnId, null, { from, to }),
      listSandDeliveries(kilnId, null, { from, to }),
      listInvoices(kilnId, null, { from, to }),
      listBrickCategories(kilnId),
    ]);

    // 2. Fuel cost per kg — every fuel purchase's amount over its actual
    // weighed-in kg, across every fuel type combined.
    const fuelAmount = round2(fuelRows.reduce((s, f) => s + f.amount, 0));
    const fuelWeight = round2(fuelRows.reduce((s, f) => s + f.actualWeightKg, 0));
    const dieselAmount = round2(dieselRows.reduce((s, d) => s + (d.costAmount ?? 0), 0));

    // 1. Production cost per brick — every logged expense, every
    // non-customer ledger DUE (wages/payments owed), every fuel purchase,
    // and every diesel fill-up in the period, spread across every brick
    // graded out of a chamber in that same window. Same formula
    // seasonFinancialSummary uses for the Overview dashboard's "Cost /
    // brick" stat, just with a real from/to range instead of a fixed
    // "last N days" — a kiln-wide average, not attributable to any one
    // batch (see chamberCostReport, financialReport.service.ts, for the
    // directly-attributable one-chamber version of this same idea). A fuel
    // purchase with a linked supplier also posts its own "FUEL"-category
    // DUE ledger entry, so that category is excluded from laborCosts here
    // to avoid double-counting it against fuelAmount below.
    const expenseCosts = expenseRows.reduce((s, e) => s + e.amount, 0);
    const laborCosts = dueEntries.filter((e) => !customerIds.has(e.personId) && e.category !== "FUEL").reduce((s, e) => s + e.amount, 0);
    const totalProductionCost = round2(expenseCosts + laborCosts + fuelAmount + dieselAmount);
    const bricksProduced = gradingRows.reduce((s, g) => s + totalBricksOf({ a1Count: g.a1Count, jhamaCount: g.jhamaCount, pelaCount: g.pelaCount, rodaCount: g.rodaCount, items: g.items as any }), 0);

    // 3. Soil cost per trolley (trolleyCount x ratePerTrolley, same as the
    // Soil report's own per-trip amount).
    const soilAmount = round2(soilRows.reduce((s, r) => s + (r.trolleyCount ?? 0) * r.ratePerTrolley, 0));
    const soilTrolleys = soilRows.reduce((s, r) => s + (r.trolleyCount ?? 0), 0);

    // 4. Sand cost per trolley (paymentGiven + paymentPending — the full
    // agreed cost, paid or not, same as the Sand report's own totals).
    const sandAmount = round2(sandRows.reduce((s, r) => s + (r.paymentGiven ?? 0) + (r.paymentPending ?? 0), 0));
    const sandTrolleys = sandRows.reduce((s, r) => s + r.trolleyCount, 0);

    // 5. Average sale rate per brick — every real brick sale (bricksCount
    // > 0; 0-brick rows are advances/general payments, not a sale) in the
    // period, kiln-wide across every category combined. Per-category
    // breakdown already exists (itemWiseAvgSaleRate report); this is the
    // one overall figure.
    const realSales = invoiceRows.filter((r) => r.bricksCount > 0);
    const salesAmount = round2(realSales.reduce((s, r) => s + r.netAmount, 0));
    const salesBricks = realSales.reduce((s, r) => s + r.bricksCount, 0);

    // 6. Average stock value per brick — current finished-goods stock
    // (brickCategories.quantity x that category's own pricePerBrick,
    // summed) over total quantity on hand. A live snapshot, not scoped to
    // the date range above (stock has no history table to look back
    // through — see stock.service.ts's getStockSnapshot comment on the
    // same limitation).
    const stockValue = round2(categories.reduce((s, c) => s + (c.quantity ?? 0) * (c.pricePerBrick ?? 0), 0));
    const stockBricks = categories.reduce((s, c) => s + (c.quantity ?? 0), 0);

    function row(metric: string, amount: number, qty: number, unit: string, basisLabel: string): AverageRow {
      return {
        metric,
        value: qty > 0 ? round2(amount / qty) : null,
        unit,
        basis: qty > 0 || amount !== 0 ? `₹${amount.toLocaleString("en-IN")} / ${qty.toLocaleString("en-IN")} ${basisLabel}` : "No data logged for this period",
      };
    }

    const rows: AverageRow[] = [
      row("Production cost per brick", totalProductionCost, bricksProduced, "₹/brick", "bricks graded"),
      row("Fuel cost per kg", fuelAmount, fuelWeight, "₹/kg", "kg"),
      row("Soil cost per trolley", soilAmount, soilTrolleys, "₹/trolley", "trolleys"),
      row("Sand cost per trolley", sandAmount, sandTrolleys, "₹/trolley", "trolleys"),
      row("Average sale rate per brick", salesAmount, salesBricks, "₹/brick", "bricks sold"),
      row("Average stock value per brick", stockValue, stockBricks, "₹/brick", "bricks in stock"),
    ];

    return {
      reportKey: "keyAverages",
      titleKey: "reports.title.keyAverages",
      columns: [
        { key: "metric", labelKey: "reports.col.metric", format: "text" },
        { key: "value", labelKey: "reports.col.average", format: "currency" },
        { key: "unit", labelKey: "reports.col.unit", format: "text" },
        { key: "basis", labelKey: "reports.col.basis", format: "text" },
      ],
      rows,
    };
  },
};

export const averagesReports: ReportDefinition[] = [keyAverages];
