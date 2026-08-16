import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createFuelPurchase, fuelStockBalance, listFuelPurchases, supplierFuelBalances } from "../services/fuelPurchase.service";
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
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(purchase);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const purchases = await listFuelPurchases(req.kiln!.id, days);
  res.json(purchases);
}

export async function stockBalance(req: AuthedRequest, res: Response) {
  const balance = await fuelStockBalance(req.kiln!.id);
  res.json(Object.fromEntries(balance));
}

export async function supplierBalances(req: AuthedRequest, res: Response) {
  const balances = await supplierFuelBalances(req.kiln!.id);
  res.json(balances);
}
