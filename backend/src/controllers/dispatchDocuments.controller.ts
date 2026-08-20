import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { DISPATCH_PAYMENT_MODES } from "../db/schema";
import {
  createChallan,
  listChallans,
  updateChallan,
  deleteChallan,
  createGatePass,
  listGatePasses,
  updateGatePass,
  deleteGatePass,
  createInvoice,
  listInvoices,
  updateInvoice,
  deleteInvoice,
} from "../services/dispatchDocuments.service";

const challanSchema = z.object({
  dispatchId: z.string(),
  vehicleNumber: z.string().optional(),
  vehicleType: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  customerName: z.string(),
  customerAddress: z.string().optional(),
  customerPhone: z.string().optional(),
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  challanDate: z.string().optional(),
  notes: z.string().optional(),
});
const challanUpdateSchema = challanSchema.omit({ dispatchId: true }).partial();

export async function createChallanHandler(req: AuthedRequest, res: Response) {
  const input = challanSchema.parse(req.body);
  const row = await createChallan(req.kiln!.id, { ...input, challanDate: input.challanDate ? new Date(input.challanDate) : undefined });
  res.status(201).json(row);
}
export async function listChallansHandler(req: AuthedRequest, res: Response) {
  res.json(await listChallans(req.kiln!.id, req.query.dispatchId as string | undefined));
}
export async function updateChallanHandler(req: AuthedRequest, res: Response) {
  const input = challanUpdateSchema.parse(req.body);
  const row = await updateChallan(req.kiln!.id, req.params.id, { ...input, challanDate: input.challanDate ? new Date(input.challanDate) : undefined });
  res.json(row);
}
export async function deleteChallanHandler(req: AuthedRequest, res: Response) {
  await deleteChallan(req.kiln!.id, req.params.id);
  res.status(204).end();
}

const gatePassSchema = z.object({
  dispatchId: z.string(),
  vehicleNumber: z.string().optional(),
  vehicleType: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  customerName: z.string(),
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  gatePassDate: z.string().optional(),
  notes: z.string().optional(),
});
const gatePassUpdateSchema = gatePassSchema.omit({ dispatchId: true }).partial();

export async function createGatePassHandler(req: AuthedRequest, res: Response) {
  const input = gatePassSchema.parse(req.body);
  const row = await createGatePass(req.kiln!.id, { ...input, gatePassDate: input.gatePassDate ? new Date(input.gatePassDate) : undefined });
  res.status(201).json(row);
}
export async function listGatePassesHandler(req: AuthedRequest, res: Response) {
  res.json(await listGatePasses(req.kiln!.id, req.query.dispatchId as string | undefined));
}
export async function updateGatePassHandler(req: AuthedRequest, res: Response) {
  const input = gatePassUpdateSchema.parse(req.body);
  const row = await updateGatePass(req.kiln!.id, req.params.id, { ...input, gatePassDate: input.gatePassDate ? new Date(input.gatePassDate) : undefined });
  res.json(row);
}
export async function deleteGatePassHandler(req: AuthedRequest, res: Response) {
  await deleteGatePass(req.kiln!.id, req.params.id);
  res.status(204).end();
}

const invoiceSchema = z.object({
  dispatchId: z.string(),
  customerName: z.string(),
  customerAddress: z.string().optional(),
  customerPhone: z.string().optional(),
  customerGstNumber: z.string().optional(),
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  ratePerBrick: z.number().min(0).optional(),
  grossAmount: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  netAmount: z.number().min(0),
  paymentMode: z.enum(DISPATCH_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  invoiceDate: z.string().optional(),
  notes: z.string().optional(),
});
const invoiceUpdateSchema = invoiceSchema.omit({ dispatchId: true }).partial();

export async function createInvoiceHandler(req: AuthedRequest, res: Response) {
  const input = invoiceSchema.parse(req.body);
  const row = await createInvoice(req.kiln!.id, { ...input, invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined });
  res.status(201).json(row);
}
export async function listInvoicesHandler(req: AuthedRequest, res: Response) {
  res.json(await listInvoices(req.kiln!.id, req.query.dispatchId as string | undefined));
}
export async function updateInvoiceHandler(req: AuthedRequest, res: Response) {
  const input = invoiceUpdateSchema.parse(req.body);
  const row = await updateInvoice(req.kiln!.id, req.params.id, { ...input, invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined });
  res.json(row);
}
export async function deleteInvoiceHandler(req: AuthedRequest, res: Response) {
  await deleteInvoice(req.kiln!.id, req.params.id);
  res.status(204).end();
}
