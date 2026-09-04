import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createExpenseType, listExpenseTypes, getExpenseTypeDetail, updateExpenseType, deleteExpenseType } from "../services/expenseType.service";

const createSchema = z.object({
  name: z.string().min(1),
  openingPaid: z.number().min(0).optional(),
  openingDue: z.number().min(0).optional(),
});
const updateSchema = createSchema.partial();

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createExpenseType(req.kiln!.id, input));
}

export async function list(req: AuthedRequest, res: Response) {
  res.json(await listExpenseTypes(req.kiln!.id));
}

export async function detail(req: AuthedRequest, res: Response) {
  res.json(await getExpenseTypeDetail(req.kiln!.id, req.params.id, req.season!.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updateExpenseType(req.kiln!.id, req.params.id, input));
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteExpenseType(req.kiln!.id, req.params.id);
  res.status(204).end();
}
