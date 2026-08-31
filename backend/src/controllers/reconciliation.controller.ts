import { Response } from "express";
import { AuthedRequest } from "../middleware/auth.middleware";
import { dashboardStockSummary, reconcileFinishedGoods, reconcileSoilToKiln } from "../services/reconciliation.service";

export async function get(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await reconcileSoilToKiln(req.kiln!.id, req.season!.id, days);
  res.json(result);
}

export async function finishedGoods(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await reconcileFinishedGoods(req.kiln!.id, req.season!.id, days);
  res.json(result);
}

export async function dashboardStock(req: AuthedRequest, res: Response) {
  const result = await dashboardStockSummary(req.kiln!.id, req.season!.id);
  res.json(result);
}
