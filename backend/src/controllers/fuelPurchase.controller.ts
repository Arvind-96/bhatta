import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createFuelPurchase,
  deleteFuelPurchase,
  fuelStockBalance,
  listFuelPurchases,
  supplierFuelBalances,
  updateFuelPurchase,
} from "../services/fuelPurchase.service";
import { LEDGER_PAYMENT_MODES } from "../db/schema";

const createSchema = z.object({
  fuelType: z.string().min(1),
  supplierId: z.string().optional(),
  vehicleNumber: z.string().optional(),
  invoicedWeightKg: z.number().positive(),
  actualWeightKg: z.number().positive(),
  amount: z.number().positive(),
  paidAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).exclude(["CASH_AND_ONLINE"]).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const purchase = await createFuelPurchase({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(purchase);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const purchases = await listFuelPurchases(req.kiln!.id, req.season!.id, days);
  res.json(purchases);
}

export async function stockBalance(req: AuthedRequest, res: Response) {
  const balance = await fuelStockBalance(req.kiln!.id, req.season!.id);
  res.json(Object.fromEntries(balance));
}

export async function supplierBalances(req: AuthedRequest, res: Response) {
  const balances = await supplierFuelBalances(req.kiln!.id, req.season!.id);
  res.json(balances);
}

const updateSchema = z.object({
  fuelType: z.string().min(1).optional(),
  vehicleNumber: z.string().optional(),
  invoicedWeightKg: z.number().positive().optional(),
  actualWeightKg: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  paidAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).exclude(["CASH_AND_ONLINE"]).optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const purchase = await updateFuelPurchase(req.kiln!.id, req.params.id, input);
  res.json(purchase);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteFuelPurchase(req.kiln!.id, req.params.id);
  res.status(204).end();
}
