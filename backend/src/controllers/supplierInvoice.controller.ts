import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import {
  createSupplierInvoice,
  getSupplierDetail,
  listAllSupplierInvoices,
  updateSupplierInvoice,
  deleteSupplierInvoice,
} from "../services/supplierInvoice.service";

const itemSchema = z.object({
  itemName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().min(0),
});

const createSchema = z.object({
  supplierId: z.string(),
  date: z.coerce.date().optional(),
  itemsReceived: z.array(itemSchema).optional(),
  totalBillAmount: z.number().min(0),
  amountPaid: z.number().min(0).optional(),
  paymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
});
const updateSchema = createSchema.partial();

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createSupplierInvoice(req.kiln!.id, input));
}

export async function detailForSupplier(req: AuthedRequest, res: Response) {
  res.json(await getSupplierDetail(req.kiln!.id, req.params.supplierId));
}

export async function listAll(req: AuthedRequest, res: Response) {
  res.json(await listAllSupplierInvoices(req.kiln!.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updateSupplierInvoice(req.kiln!.id, req.params.id, input));
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSupplierInvoice(req.kiln!.id, req.params.id);
  res.status(204).end();
}
