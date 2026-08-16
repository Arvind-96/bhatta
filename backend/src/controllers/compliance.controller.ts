import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createComplianceDocument, listComplianceDocuments, listExpiringSoon } from "../services/compliance.service";
import { COMPLIANCE_DOCUMENT_TYPES } from "../db/schema";

const createSchema = z.object({
  documentType: z.enum(COMPLIANCE_DOCUMENT_TYPES),
  title: z.string(),
  issueDate: z.string().optional(),
  expiryDate: z.string(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const doc = await createComplianceDocument({
    ...input,
    kilnId: req.kiln!.id,
    issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
    expiryDate: new Date(input.expiryDate),
  });
  res.status(201).json(doc);
}

export async function list(req: AuthedRequest, res: Response) {
  const docs = await listComplianceDocuments(req.kiln!.id);
  res.json(docs);
}

export async function expiringSoon(req: AuthedRequest, res: Response) {
  const withinDays = req.query.withinDays ? Number(req.query.withinDays) : 30;
  const docs = await listExpiringSoon(req.kiln!.id, withinDays);
  res.json(docs);
}
