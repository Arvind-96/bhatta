import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createSandContract, deleteSandContract, listSandContracts, updateSandContract } from "../services/sandContract.service";
import { LEDGER_PAYMENT_MODES, SAND_CONTRACT_RATE_TYPES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

const createSchema = z
  .object({
    sandContractorId: z.string(),
    rateType: z.enum(SAND_CONTRACT_RATE_TYPES).optional(),
    contractedTrolleys: z.number().positive().optional(),
    contractPrice: z.number().positive().optional(),
    totalContractValue: z.number().positive(),
    advanceAmount: z.number().nonnegative().optional(),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.advanceAmount ?? 0, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const contract = await createSandContract({
    ...input,
    kilnId: req.kiln!.id,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
  });
  res.status(201).json(contract);
}

export async function list(req: AuthedRequest, res: Response) {
  const contracts = await listSandContracts(req.kiln!.id, {
    sandContractorId: req.query.sandContractorId as string | undefined,
  });
  res.json(contracts);
}

// paymentMode/cashAmount/onlineAmount describe the delta if advanceAmount
// is raised — the cash+online-must-sum check happens in the service
// (updateSandContract) against that delta, same reasoning as
// soilContract.controller.ts's updateSchema.
const updateSchema = z.object({
  rateType: z.enum(SAND_CONTRACT_RATE_TYPES).optional(),
  contractedTrolleys: z.number().positive().optional(),
  contractPrice: z.number().positive().optional(),
  totalContractValue: z.number().positive().optional(),
  advanceAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const contract = await updateSandContract(req.kiln!.id, req.params.id, {
    ...input,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
  });
  res.json(contract);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSandContract(req.kiln!.id, req.params.id);
  res.status(204).send();
}
