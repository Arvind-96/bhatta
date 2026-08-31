import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { DISPATCH_PAYMENT_MODES as PAYMENT_MODES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";
import {
  cancelSaleOrder,
  createSaleOrder,
  fulfillSaleOrder,
  getSaleOrder,
  listSaleOrders,
  updateSaleOrder,
} from "../services/saleOrder.service";

const lineItemSchema = z.object({
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  pricePerBrick: z.number().min(0).optional(),
});

const createSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  customerPhone: z.string().optional(),
  categoryId: z.string().optional(),
  items: z.array(lineItemSchema).optional(),
  bricksCount: z.number().int().positive().optional(),
  ratePerBrick: z.number().min(0).optional(),
  estimatedAmount: z.number().min(0).optional(),
  orderDate: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});
const updateSchema = createSchema.partial();

const fulfillSchema = z
  .object({
    bricksCount: z.number().int().positive(),
    amount: z.number().min(0),
    driverId: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    vehicleNumber: z.string().optional(),
    vehicleType: z.string().optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    dispatchedOn: z.coerce.date().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amount, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createSaleOrder({ ...input, kilnId: req.kiln!.id, seasonId: req.season!.id }));
}

export async function list(req: AuthedRequest, res: Response) {
  const { status, customerId, from, to } = req.query;
  res.json(
    await listSaleOrders(req.kiln!.id, req.season!.id, {
      status: typeof status === "string" ? status : undefined,
      customerId: typeof customerId === "string" ? customerId : undefined,
      from: typeof from === "string" ? new Date(from) : undefined,
      to: typeof to === "string" ? new Date(to) : undefined,
    })
  );
}

export async function detail(req: AuthedRequest, res: Response) {
  res.json(await getSaleOrder(req.kiln!.id, req.params.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updateSaleOrder(req.kiln!.id, req.params.id, input));
}

export async function cancel(req: AuthedRequest, res: Response) {
  res.json(await cancelSaleOrder(req.kiln!.id, req.params.id));
}

export async function fulfill(req: AuthedRequest, res: Response) {
  const input = fulfillSchema.parse(req.body);
  res.status(201).json(await fulfillSaleOrder(req.kiln!.id, req.season!.id, req.params.id, input));
}
