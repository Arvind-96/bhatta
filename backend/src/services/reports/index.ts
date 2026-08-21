import { peopleReports } from "./people.reports";
import { tradeReports } from "./trade.reports";
import { resourcesReports } from "./resources.reports";
import { productionReports } from "./production.reports";
import { ReportDefinition } from "./types";

export * from "./types";

const ALL_REPORTS: ReportDefinition[] = [...productionReports, ...tradeReports, ...resourcesReports, ...peopleReports];

export const reportRegistry = new Map(ALL_REPORTS.map((r) => [r.key, r]));
