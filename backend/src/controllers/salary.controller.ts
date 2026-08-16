import { Response } from "express";
import fs from "fs";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  currentMonthString,
  generateForKiln,
  getSlipFile,
  listSalaryStatus,
  listSlipsForPerson,
} from "../services/salary.service";

const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function status(req: AuthedRequest, res: Response) {
  const { month } = monthQuerySchema.parse(req.query);
  const result = await listSalaryStatus(req.kiln!.id, month ?? currentMonthString());
  res.json(result);
}

const generateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function generate(req: AuthedRequest, res: Response) {
  const input = generateSchema.parse(req.body);
  const result = await generateForKiln(req.kiln!.id, input.month);
  res.json(result);
}

export async function forPerson(req: AuthedRequest, res: Response) {
  const slips = await listSlipsForPerson(req.kiln!.id, req.params.personId);
  res.json(slips);
}

const langSchema = z.object({ lang: z.enum(["en", "hi"]).default("en") });

export async function downloadPdf(req: AuthedRequest, res: Response) {
  const { lang } = langSchema.parse(req.query);
  const filePath = await getSlipFile(req.kiln!.id, req.params.slipId, lang);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Slip file not found on disk" });
  }
  res.sendFile(filePath);
}
