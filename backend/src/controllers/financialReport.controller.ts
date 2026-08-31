import { Response } from "express";
import { AuthedRequest } from "../middleware/auth.middleware";
import { chamberCostReport, seasonFinancialSummary } from "../services/financialReport.service";

export async function summary(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await seasonFinancialSummary(req.kiln!.id, req.season!.id, days);
  res.json(result);
}

export async function chamberCost(req: AuthedRequest, res: Response) {
  const result = await chamberCostReport(req.kiln!.id, req.season!.id, req.params.gherId);
  res.json(result);
}
