import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createBankAccount, getBankAccount, listBankAccounts, updateBankAccount } from "../services/bankAccount.service";

const createSchema = z.object({
  bankName: z.string().min(1),
  accountLabel: z.string().optional(),
  accountNumberLast4: z.string().optional(),
  openingBalance: z.number().optional(),
  openingBalanceDate: z.coerce.date().optional(),
});
const updateSchema = createSchema.partial();

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createBankAccount(req.kiln!.id, input));
}

export async function list(req: AuthedRequest, res: Response) {
  res.json(await listBankAccounts(req.kiln!.id));
}

export async function detail(req: AuthedRequest, res: Response) {
  res.json(await getBankAccount(req.kiln!.id, req.params.id));
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  res.json(await updateBankAccount(req.kiln!.id, req.params.id, input));
}
