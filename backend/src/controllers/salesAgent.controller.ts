import { Response } from "express";
import { AuthedRequest } from "../middleware/auth.middleware";
import { getSalesAgentDetail, listSalesAgentsWithSummary } from "../services/salesAgent.service";

export async function detail(req: AuthedRequest, res: Response) {
  const result = await getSalesAgentDetail(req.kiln!.id, req.params.id);
  res.json(result);
}

export async function listWithSummary(req: AuthedRequest, res: Response) {
  const result = await listSalesAgentsWithSummary(req.kiln!.id);
  res.json(result);
}
