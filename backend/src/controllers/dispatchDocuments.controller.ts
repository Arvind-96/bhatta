import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { DISPATCH_PAYMENT_MODES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";
import {
  createChallan,
  listChallans,
  updateChallan,
  cancelChallan,
  nextChallanSequenceNumber,
  createGatePass,
  listGatePasses,
  updateGatePass,
  cancelGatePass,
  nextGatePassSequenceNumber,
  createInvoice,
  listInvoices,
  updateInvoice,
  cancelInvoice,
  nextInvoiceSequenceNumber,
} from "../services/dispatchDocuments.service";

// One row per brick category on this document — see BrickLineItem's doc
// comment in db/schema/_helpers.ts. `pricePerBrick` is unused on Challan/
// Gate Pass (no pricing there, same as their existing bricksCount-only
// scalar shape) but accepted on all three for one shared schema.
const lineItemSchema = z.object({
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  pricePerBrick: z.number().min(0).optional(),
});

// Absent/undefined means "leave blank" — the admin cleared the pre-filled
// suggestion; see dispatchDocuments.service.ts's createChallan/etc.
const challanSchema = z.object({
  dispatchId: z.string(),
  sequenceNumber: z.number().int().positive().optional(),
  vehicleNumber: z.string().optional(),
  vehicleType: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  customerName: z.string(),
  customerAddress: z.string().optional(),
  customerPhone: z.string().optional(),
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  items: z.array(lineItemSchema).optional(),
  placeOfSupply: z.string().optional(),
  challanDate: z.string().min(1, "Transaction date is required"),
  notes: z.string().optional(),
});
const challanUpdateSchema = challanSchema.omit({ dispatchId: true }).partial();

export async function createChallanHandler(req: AuthedRequest, res: Response) {
  const input = challanSchema.parse(req.body);
  const row = await createChallan(req.kiln!.id, req.season!.id, { ...input, challanDate: input.challanDate ? new Date(input.challanDate) : undefined });
  res.status(201).json(row);
}
// includeCancelled: true — the Challan list page (and DispatchDetailPage's
// own per-dispatch document list, same endpoint) shows a cancelled
// challan too, marked with a badge, per the client's explicit "stays
// visible" answer — never silently hidden the way a deleted one used to be.
export async function listChallansHandler(req: AuthedRequest, res: Response) {
  res.json(await listChallans(req.kiln!.id, req.season!.id, { dispatchId: req.query.dispatchId as string | undefined, includeCancelled: true }));
}
export async function nextChallanSequenceNumberHandler(req: AuthedRequest, res: Response) {
  res.json({ nextSequenceNumber: await nextChallanSequenceNumber(req.kiln!.id, req.season!.id) });
}
export async function updateChallanHandler(req: AuthedRequest, res: Response) {
  const input = challanUpdateSchema.parse(req.body);
  const row = await updateChallan(req.kiln!.id, req.params.id, { ...input, challanDate: input.challanDate ? new Date(input.challanDate) : undefined });
  res.json(row);
}
// Route stays DELETE /challans/:id — same API surface, now cancels
// instead of hard-deleting (see cancelChallan's own doc comment).
export async function deleteChallanHandler(req: AuthedRequest, res: Response) {
  await cancelChallan(req.kiln!.id, req.params.id);
  res.status(204).end();
}

const gatePassSchema = z.object({
  dispatchId: z.string(),
  sequenceNumber: z.number().int().positive().optional(),
  vehicleNumber: z.string().optional(),
  vehicleType: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  customerName: z.string(),
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  items: z.array(lineItemSchema).optional(),
  placeOfSupply: z.string().optional(),
  gatePassDate: z.string().min(1, "Transaction date is required"),
  notes: z.string().optional(),
});
const gatePassUpdateSchema = gatePassSchema.omit({ dispatchId: true }).partial();

export async function createGatePassHandler(req: AuthedRequest, res: Response) {
  const input = gatePassSchema.parse(req.body);
  const row = await createGatePass(req.kiln!.id, req.season!.id, { ...input, gatePassDate: input.gatePassDate ? new Date(input.gatePassDate) : undefined });
  res.status(201).json(row);
}
// includeCancelled: true — same reasoning as listChallansHandler above.
export async function listGatePassesHandler(req: AuthedRequest, res: Response) {
  res.json(await listGatePasses(req.kiln!.id, req.season!.id, { dispatchId: req.query.dispatchId as string | undefined, includeCancelled: true }));
}
export async function nextGatePassSequenceNumberHandler(req: AuthedRequest, res: Response) {
  res.json({ nextSequenceNumber: await nextGatePassSequenceNumber(req.kiln!.id, req.season!.id) });
}
export async function updateGatePassHandler(req: AuthedRequest, res: Response) {
  const input = gatePassUpdateSchema.parse(req.body);
  const row = await updateGatePass(req.kiln!.id, req.params.id, { ...input, gatePassDate: input.gatePassDate ? new Date(input.gatePassDate) : undefined });
  res.json(row);
}
// Route stays DELETE /gate-passes/:id — now cancels, not hard-deletes.
export async function deleteGatePassHandler(req: AuthedRequest, res: Response) {
  await cancelGatePass(req.kiln!.id, req.params.id);
  res.status(204).end();
}

// Kept as a plain ZodObject (no .superRefine() chained directly onto it) so
// invoiceUpdateSchema below can still derive from it via .omit()/.partial()
// — those aren't available once .superRefine() turns it into a ZodEffects.
// invoiceSchema/invoiceUpdateSchema each chain their own .superRefine()
// afterward instead (see below), same end result.
const invoiceBaseSchema = z.object({
  // Absent for a Customer-page-originated invoice (Add Amount, or a
  // Customer-aware Create Invoice) — bricksCount is 0 in exactly that
  // case, hence nonnegative() rather than positive() below.
  dispatchId: z.string().optional(),
  sequenceNumber: z.number().int().positive().optional(),
  customerId: z.string().optional(),
  partnerId: z.string().optional(),
  agentId: z.string().optional(),
  customerName: z.string(),
  customerAddress: z.string().optional(),
  customerPhone: z.string().optional(),
  customerGstNumber: z.string().optional(),
  customerStateCode: z.string().optional(),
  vehicleNumber: z.string().optional(),
  gstRatePercent: z.number().min(0).max(100).optional(),
  gstType: z.enum(["CGST_SGST", "IGST"]).optional(),
  termsAndConditions: z.string().optional(),
  categoryId: z.string().optional(),
  bricksCount: z.number().int().nonnegative(),
  items: z.array(lineItemSchema).optional(),
  ratePerBrick: z.number().min(0).optional(),
  grossAmount: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  netAmount: z.number().min(0),
  amountPaidNow: z.number().min(0).optional(),
  paymentMode: z.enum(DISPATCH_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  placeOfSupply: z.string().optional(),
  invoiceDate: z.string().min(1, "Transaction date is required"),
  notes: z.string().optional(),
});

// Cash/online must sum to what's actually being collected right now —
// amountPaidNow when given, else the full netAmount (same "unset =
// fully paid" convention dispatchDocuments.service.ts's createInvoice/
// partnerPendingAmount already use), mirroring dispatch.controller.ts's
// own createSchema.superRefine pattern for the "amount net of discount"
// case (Invoice's equivalent net figure is netAmount, already
// gross-minus-discount by the time it reaches this schema).
const invoiceSchema = invoiceBaseSchema.superRefine((data, ctx) => {
  validateCashOnlineSplit(data, data.amountPaidNow ?? data.netAmount, ctx);
});
const invoiceUpdateSchema = invoiceBaseSchema
  .omit({ dispatchId: true, partnerId: true, agentId: true })
  .partial()
  .extend({ partnerId: z.string().nullable().optional(), agentId: z.string().nullable().optional() })
  // Every field is optional on an update, so this only runs when there's
  // actually something to check against — a narrower field-only edit that
  // touches neither amountPaidNow nor netAmount simply skips it, same
  // "narrower edit skips the guard" convention dispatch.controller.ts's own
  // updateSchema uses for its `amount === undefined` check.
  .superRefine((data, ctx) => {
    if (data.amountPaidNow === undefined && data.netAmount === undefined) return;
    validateCashOnlineSplit(data, data.amountPaidNow ?? data.netAmount ?? 0, ctx);
  });

export async function createInvoiceHandler(req: AuthedRequest, res: Response) {
  const input = invoiceSchema.parse(req.body);
  const row = await createInvoice(req.kiln!.id, req.season!.id, { ...input, invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined });
  res.status(201).json(row);
}
// includeCancelled: true — same reasoning as listChallansHandler above.
export async function listInvoicesHandler(req: AuthedRequest, res: Response) {
  res.json(await listInvoices(req.kiln!.id, req.season!.id, { dispatchId: req.query.dispatchId as string | undefined, includeCancelled: true }));
}
export async function nextInvoiceSequenceNumberHandler(req: AuthedRequest, res: Response) {
  res.json({ nextSequenceNumber: await nextInvoiceSequenceNumber(req.kiln!.id, req.season!.id) });
}
export async function updateInvoiceHandler(req: AuthedRequest, res: Response) {
  const input = invoiceUpdateSchema.parse(req.body);
  const row = await updateInvoice(req.kiln!.id, req.params.id, { ...input, invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined });
  res.json(row);
}
// Route stays DELETE /invoices/:id — now cancels, not hard-deletes.
export async function deleteInvoiceHandler(req: AuthedRequest, res: Response) {
  await cancelInvoice(req.kiln!.id, req.params.id);
  res.status(204).end();
}
