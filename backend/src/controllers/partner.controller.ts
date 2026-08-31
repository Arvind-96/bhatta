import { Response } from "express";
import { AuthedRequest } from "../middleware/auth.middleware";
import { getPartnerDetail, partnerProfitShare } from "../services/partner.service";

export async function detail(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await getPartnerDetail(req.kiln!.id, req.season!.id, req.params.id, days);
  res.json(result);
}

export async function profitShare(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await partnerProfitShare(req.kiln!.id, req.season!.id, req.params.id, days);
  res.json(result);
}
