import { listDieselEntries, vehicleDieselSummary } from "../kilnVehicle.service";
import { listStockEntries } from "../stock.service";
import { listInventoryItemsForPeriod } from "../inventory.service";
import { tractorFleetSummary } from "../stacking.service";
import { machineFleetSummary } from "../machine.service";
import { getCurrentSeasonId } from "../season.util";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, refName, round2 } from "./types";

// Per-vehicle rollup for the period — entity-summary shape (like
// Customers/Inventory below), not a time series, so no groupBy.
const vehicles: ReportDefinition = {
  key: "vehicles",
  titleKey: "reports.title.vehicles",
  async run(kilnId, filters) {
    const rows = await vehicleDieselSummary(kilnId, null, { from: filters.from, to: filters.to });
    const scoped = filters.vehicleId ? rows.filter((r) => r.vehicleId === filters.vehicleId) : rows;
    const detail = scoped.map((r) => ({
      vehicle: r.vehicleName,
      type: r.vehicleType,
      fillUpCount: r.fillUpCount,
      totalLiters: round2(r.totalLiters),
      distanceCovered: round2(r.distanceCovered),
    }));
    return {
      reportKey: "vehicles",
      titleKey: "reports.title.vehicles",
      columns: [
        { key: "vehicle", labelKey: "reports.col.vehicle", format: "text" },
        { key: "type", labelKey: "reports.col.vehicleType", format: "text" },
        { key: "fillUpCount", labelKey: "reports.col.fillUpCount", format: "number" },
        { key: "totalLiters", labelKey: "reports.col.totalLiters", format: "number" },
        { key: "distanceCovered", labelKey: "reports.col.distanceCovered", format: "number" },
      ],
      rows: detail,
      totals: { totalLiters: round2(detail.reduce((s, r) => s + r.totalLiters, 0)) },
    };
  },
};

const diesel: ReportDefinition = {
  key: "diesel",
  titleKey: "reports.title.diesel",
  async run(kilnId, filters) {
    const rows = await listDieselEntries(kilnId, null, { from: filters.from, to: filters.to, vehicleId: filters.vehicleId, driverId: filters.driverId });
    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      vehicle: refName(r.vehicleId),
      driver: refName(r.driverId),
      quantityLiters: r.quantityLiters,
      meterReading: r.initialMeterReading ?? null,
    }));

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["quantityLiters"], filters.groupBy);
      return {
        reportKey: "diesel",
        titleKey: "reports.title.diesel",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "quantityLiters", labelKey: "reports.col.totalLiters", format: "number" },
        ],
        rows: grouped,
        totals: { quantityLiters: round2(grouped.reduce((s, r) => s + (r.quantityLiters as number), 0)) },
      };
    }

    return {
      reportKey: "diesel",
      titleKey: "reports.title.diesel",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "vehicle", labelKey: "reports.col.vehicle", format: "text" },
        { key: "driver", labelKey: "reports.col.driver", format: "text" },
        { key: "quantityLiters", labelKey: "reports.col.quantityLiters", format: "number" },
        { key: "meterReading", labelKey: "reports.col.meterReading", format: "number" },
      ],
      rows: detail,
      totals: { quantityLiters: round2(detail.reduce((s, r) => s + r.quantityLiters, 0)) },
    };
  },
};

const stock: ReportDefinition = {
  key: "stock",
  titleKey: "reports.title.stock",
  async run(kilnId, filters) {
    const rows = await listStockEntries(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.recordedOn ? r.recordedOn.toISOString() : null,
      type: r.type,
      itemName: r.itemName,
      quantity: r.quantity,
      unit: r.unit ?? "",
    }));

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["quantity"], filters.groupBy);
      return {
        reportKey: "stock",
        titleKey: "reports.title.stock",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "quantity", labelKey: "reports.col.netQuantity", format: "number" },
        ],
        rows: grouped,
        totals: { quantity: round2(grouped.reduce((s, r) => s + (r.quantity as number), 0)) },
      };
    }

    return {
      reportKey: "stock",
      titleKey: "reports.title.stock",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "type", labelKey: "reports.col.stockType", format: "text" },
        { key: "itemName", labelKey: "reports.col.itemName", format: "text" },
        { key: "quantity", labelKey: "reports.col.quantity", format: "number" },
        { key: "unit", labelKey: "reports.col.unit", format: "text" },
      ],
      rows: detail,
      totals: { quantity: round2(detail.reduce((s, r) => s + r.quantity, 0)) },
    };
  },
};

const inventory: ReportDefinition = {
  key: "inventory",
  titleKey: "reports.title.inventory",
  async run(kilnId, filters) {
    const rows = await listInventoryItemsForPeriod(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      name: r.name,
      remaining: r.quantity,
      usedInPeriod: r.usedInPeriod,
      unit: r.unit ?? "",
    }));
    return {
      reportKey: "inventory",
      titleKey: "reports.title.inventory",
      columns: [
        { key: "name", labelKey: "reports.col.itemName", format: "text" },
        { key: "remaining", labelKey: "reports.col.remaining", format: "number" },
        { key: "usedInPeriod", labelKey: "reports.col.usedInPeriod", format: "number" },
        { key: "unit", labelKey: "reports.col.unit", format: "text" },
      ],
      rows: detail,
      totals: { usedInPeriod: round2(detail.reduce((s, r) => s + r.usedInPeriod, 0)) },
    };
  },
};

// Report-level unification only, per the deliberate scope decision this
// feature was built under: kilnVehicles (diesel-tracked), stackingVehicles
// (bharai tractors, via stackingEntries.tractorNumber — this app's third,
// completely independent vehicle identity), and machines (equipment fleet)
// stay three separate systems with no schema/FK merge; this report just
// queries all three and tags each row with its source. tractorFleetSummary
// is season-scoped (no all-time variant exists), so this covers the
// current season's tractor trips only, unlike the other two sources below.
const vehicleWork: ReportDefinition = {
  key: "vehicleWork",
  titleKey: "reports.title.vehicleWork",
  async run(kilnId, filters) {
    const currentSeasonId = await getCurrentSeasonId(kilnId);

    const [dieselRows, tractorRows, machineRows] = await Promise.all([
      vehicleDieselSummary(kilnId, null, { from: filters.from, to: filters.to }),
      tractorFleetSummary(kilnId, currentSeasonId),
      machineFleetSummary(kilnId, { from: filters.from, to: filters.to }),
    ]);

    const detail = [
      ...dieselRows.map((r) => ({
        source: "Diesel Vehicle",
        vehicle: r.vehicleName,
        fillUpCount: r.fillUpCount,
        quantity: round2(r.totalLiters),
        averagePerFillUp: r.fillUpCount > 0 ? round2(r.totalLiters / r.fillUpCount) : 0,
      })),
      ...tractorRows.map((r) => ({
        source: "Stacking Tractor",
        vehicle: r.tractorNumber,
        fillUpCount: r.tripCount,
        quantity: r.totalBricksStacked,
        averagePerFillUp: r.tripCount > 0 ? round2(r.totalBricksStacked / r.tripCount) : 0,
      })),
      ...machineRows
        .filter((r) => r.fillUpCount > 0)
        .map((r) => ({
          source: "Machine",
          vehicle: r.machineName,
          fillUpCount: r.fillUpCount,
          quantity: r.fuelQuantity,
          averagePerFillUp: r.fillUpCount > 0 ? round2(r.fuelQuantity / r.fillUpCount) : 0,
        })),
    ];

    return {
      reportKey: "vehicleWork",
      titleKey: "reports.title.vehicleWork",
      columns: [
        { key: "source", labelKey: "reports.col.source", format: "text" },
        { key: "vehicle", labelKey: "reports.col.vehicle", format: "text" },
        { key: "fillUpCount", labelKey: "reports.col.fillUpCount", format: "number" },
        { key: "quantity", labelKey: "reports.col.quantity", format: "number" },
        { key: "averagePerFillUp", labelKey: "reports.col.averagePerFillUp", format: "number" },
      ],
      rows: detail,
    };
  },
};

export const resourcesReports: ReportDefinition[] = [vehicles, diesel, stock, inventory, vehicleWork];
