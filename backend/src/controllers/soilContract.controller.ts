import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  contractDailyMovement,
  contractsExpiringSoon,
  createSoilContract,
  deleteSoilContract,
  getContractSummary,
  listSoilContracts,
  settleContract,
  soilContractDashboard,
  updateContractStatus,
  updateSoilContract,
} from "../services/soilContract.service";
import { DEPTH_UNITS, LEDGER_PAYMENT_MODES, SOIL_CONTRACT_RATE_TYPES, SOIL_CONTRACT_STATUSES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

// Per-rateType required-ness (contractedQuantity+ratePerTrolley for
// PER_TROLLEY, contractedAreaBigha+ratePerBigha for PER_BIGHA, etc.) is
// enforced once in soilContract.service.ts's computeTotalContractValue
// rather than duplicated here — everything rate-related is optional at the
// schema level, and the service throws a clear error if what's needed for
// the chosen rateType wasn't sent.
const createSchema = z
  .object({
    landId: z.string(),
    landownerId: z.string(),
    soilType: z.string().optional(),
    rateType: z.enum(SOIL_CONTRACT_RATE_TYPES).optional(),
    contractedQuantity: z.number().positive().optional(),
    ratePerTrolley: z.number().positive().optional(),
    contractedAreaBigha: z.number().positive().optional(),
    ratePerBigha: z.number().positive().optional(),
    contractedDepth: z.number().positive().optional(),
    depthUnit: z.enum(DEPTH_UNITS).optional(),
    ratePerDepthUnit: z.number().positive().optional(),
    totalContractValue: z.number().positive().optional(),
    advanceAmount: z.number().nonnegative().optional(),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    agreedDepthFeet: z.number().positive().optional(),
    paymentTerms: z.string().optional(),
    notes: z.string().optional(),
  })
  // Cash/online must sum to the advance actually paid — the DUE side
  // (totalContractValue) is a bill, not a payment, so it never carries a
  // payment mode/split.
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.advanceAmount ?? 0, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const contract = await createSoilContract({
    ...input,
    kilnId: req.kiln!.id,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
  });
  res.status(201).json(contract);
}

export async function list(req: AuthedRequest, res: Response) {
  const statusQuery = req.query.status as string | undefined;
  const contracts = await listSoilContracts(req.kiln!.id, {
    landownerId: req.query.landownerId as string | undefined,
    landId: req.query.landId as string | undefined,
    status: statusQuery ? z.enum(SOIL_CONTRACT_STATUSES).parse(statusQuery) : undefined,
  });

  const summaries = await Promise.all(
    contracts.map(async (c) => {
      const { contract, ...computed } = await getContractSummary(req.kiln!.id, c._id);
      return { ...c, ...computed };
    })
  );
  res.json(summaries);
}

export async function getOne(req: AuthedRequest, res: Response) {
  const summary = await getContractSummary(req.kiln!.id, req.params.id);
  res.json(summary);
}

const updateSchema = z.object({
  soilType: z.string().optional(),
  rateType: z.enum(SOIL_CONTRACT_RATE_TYPES).optional(),
  contractedQuantity: z.number().positive().optional(),
  ratePerTrolley: z.number().positive().optional(),
  contractedAreaBigha: z.number().positive().optional(),
  ratePerBigha: z.number().positive().optional(),
  contractedDepth: z.number().positive().optional(),
  depthUnit: z.enum(DEPTH_UNITS).optional(),
  ratePerDepthUnit: z.number().positive().optional(),
  totalContractValue: z.number().positive().optional(),
  advanceAmount: z.number().nonnegative().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  agreedDepthFeet: z.number().positive().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const contract = await updateSoilContract(req.kiln!.id, req.params.id, {
    ...input,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
  });
  res.json(contract);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteSoilContract(req.kiln!.id, req.params.id);
  res.status(204).send();
}

const statusSchema = z.object({ status: z.enum(SOIL_CONTRACT_STATUSES) });

export async function updateStatus(req: AuthedRequest, res: Response) {
  const input = statusSchema.parse(req.body);
  const contract = await updateContractStatus(req.kiln!.id, req.params.id, input.status);
  res.json(contract);
}

export async function settle(req: AuthedRequest, res: Response) {
  const result = await settleContract(req.kiln!.id, req.params.id);
  res.json(result);
}

export async function expiringSoon(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const result = await contractsExpiringSoon(req.kiln!.id, days);
  res.json(result);
}

export async function dashboard(req: AuthedRequest, res: Response) {
  const result = await soilContractDashboard(req.kiln!.id);
  res.json(result);
}

export async function dailyMovement(req: AuthedRequest, res: Response) {
  const result = await contractDailyMovement(req.kiln!.id, req.params.id);
  res.json(result);
}
