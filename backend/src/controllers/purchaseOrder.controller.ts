import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { validateCashOnlineSplit } from "../utils/paymentSplit";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  fulfillPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrder,
} from "../services/purchaseOrder.service";

const itemSchema = z.object({
  itemName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().min(0),
  itemGroup: z.string().optional(),
});

const createSchema = z.object({
  supplierId: z.string(),
  items: z.array(itemSchema).optional(),
  expectedAmount: z.number().min(0).optional(),
  orderDate: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});
const updateSchema = createSchema.partial();

const fulfillSchema = z
  .object({
    itemsReceived: z.array(itemSchema).optional(),
    totalBillAmount: z.number().min(0),
    amountPaid: z.number().min(0).optional(),
    paymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    date: z.coerce.date().optional(),
    markFulfilled: z.boolean().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amountPaid ?? 0, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createPurchaseOrder({ ...input, kilnId: req.kiln!.id, seasonId: req.season!.id }));
}

export async function list(req: AuthedRequest, res: Response) {
  const { status, supplierId, from, to } = req.query;
  res.json(
    await listPurchaseOrders(req.kiln!.id, req.season!.id, {
      status: typeof status === "string" ? status : undefined,
      supplierId: typeof supplierId === "string" ? supplierId : undefined,
      from: typeof from === "string" ? new Date(from) : undefined,
      to: typeof to === "string" ? new Date(to) : undefined,
    })
  );
}

export async function detail(req: AuthedRequest, res: Response) {
  res.json(await getPurchaseOrder(req.kiln!.id, req.params.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updatePurchaseOrder(req.kiln!.id, req.params.id, input));
}

export async function cancel(req: AuthedRequest, res: Response) {
  res.json(await cancelPurchaseOrder(req.kiln!.id, req.params.id));
}

export async function fulfill(req: AuthedRequest, res: Response) {
  const { markFulfilled, ...input } = fulfillSchema.parse(req.body);
  res.status(201).json(await fulfillPurchaseOrder(req.kiln!.id, req.season!.id, req.params.id, input, markFulfilled ?? true));
}
