import { Response } from "express";
import { AuthedRequest } from "../middleware/auth.middleware";
import { reportRegistry, ReportFilters } from "../services/reports";
import { dashboardSummary } from "../services/reports/dashboard";
import { ReportGroupBy } from "../utils/reportPeriod";

const GROUP_BY_VALUES: ReportGroupBy[] = ["none", "day", "week", "month", "quarter", "year"];

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function dateParam(v: unknown, endOfDay = false): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  // A plain "YYYY-MM-DD" `to` value parses as that day's UTC midnight —
  // push it to the end of the day so same-day entries (which carry a real
  // time-of-day, not midnight) aren't silently excluded by the lte() filter.
  if (endOfDay) d.setUTCHours(23, 59, 59, 999);
  return d;
}

export async function runReport(req: AuthedRequest, res: Response) {
  const key = req.params.key;
  const definition = reportRegistry.get(key);
  if (!definition) {
    return res.status(404).json({ error: `Unknown report: ${key}` });
  }

  const groupByParam = str(req.query.groupBy);
  const filters: ReportFilters = {
    from: dateParam(req.query.from),
    to: dateParam(req.query.to, true),
    groupBy: groupByParam && (GROUP_BY_VALUES as string[]).includes(groupByParam) ? (groupByParam as ReportGroupBy) : "none",
    personId: str(req.query.personId),
    personType: str(req.query.personType),
    customerId: str(req.query.customerId),
    vehicleId: str(req.query.vehicleId),
    driverId: str(req.query.driverId),
    category: str(req.query.category),
    contractorId: str(req.query.contractorId),
    damageFault: str(req.query.damageFault),
    damageThreshold: req.query.damageThreshold ? Number(req.query.damageThreshold) : undefined,
    workType: str(req.query.workType),
    status: str(req.query.status),
  };

  const result = await definition.run(req.kiln!.id, filters);
  res.json(result);
}

export async function listReportKeys(_req: AuthedRequest, res: Response) {
  res.json(Array.from(reportRegistry.keys()));
}

export async function dashboardSummaryHandler(req: AuthedRequest, res: Response) {
  const result = await dashboardSummary(req.kiln!.id, req.season!.id);
  res.json(result);
}
