import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createCustomer, listCustomers, getCustomerDetail, updateCustomer, deleteCustomer } from "../services/customer.service";

const driverSchema = z.object({ name: z.string(), phone: z.string(), address: z.string() });
const vehicleSchema = z.object({ vehicleType: z.string(), vehicleNumber: z.string() });

const createSchema = z.object({
  name: z.string(),
  phones: z.array(z.string()).optional(),
  addresses: z.array(z.string()).optional(),
  drivers: z.array(driverSchema).optional(),
  vehicles: z.array(vehicleSchema).optional(),
  openingPaid: z.number().min(0).optional(),
  openingDue: z.number().min(0).optional(),
});
const updateSchema = createSchema.partial();

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createCustomer(req.kiln!.id, input));
}

export async function list(req: AuthedRequest, res: Response) {
  res.json(await listCustomers(req.kiln!.id));
}

export async function detail(req: AuthedRequest, res: Response) {
  res.json(await getCustomerDetail(req.kiln!.id, req.params.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updateCustomer(req.kiln!.id, req.params.id, input));
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteCustomer(req.kiln!.id, req.params.id);
  res.status(204).end();
}
