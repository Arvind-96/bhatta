import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { SUPPLY_UNITS } from "../db/schema";
import { createSupplier, listSuppliers, updateSupplier, deleteSupplier } from "../services/supplier.service";
import { getSupplierDetail } from "../services/supplierInvoice.service";

const supplyListItemSchema = z.object({
  itemName: z.string().min(1),
  unit: z.enum(SUPPLY_UNITS),
  rate: z.number().min(0).optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  suppliesList: z.array(supplyListItemSchema).optional(),
  dateAdded: z.coerce.date().optional(),
});
const updateSchema = createSchema.partial();

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createSupplier(req.kiln!.id, input));
}

export async function list(req: AuthedRequest, res: Response) {
  res.json(await listSuppliers(req.kiln!.id));
}

export async function detail(req: AuthedRequest, res: Response) {
  res.json(await getSupplierDetail(req.kiln!.id, req.params.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updateSupplier(req.kiln!.id, req.params.id, input));
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSupplier(req.kiln!.id, req.params.id);
  res.status(204).end();
}
