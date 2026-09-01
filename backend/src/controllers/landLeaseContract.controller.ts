import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createLandLeaseContract,
  deleteLandLeaseContract,
  getLandLeaseContractSummary,
  landLeaseContractsExpiringSoon,
  listLandLeaseContracts,
  updateLandLeaseContract,
  updateLandLeaseContractStatus,
} from "../services/landLeaseContract.service";
import { LAND_LEASE_DEPTH_UNITS, LAND_LEASE_RATE_TYPES, LAND_LEASE_CONTRACT_STATUSES, LEDGER_PAYMENT_MODES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

const createSchema = z
  .object({
    landId: z.string(),
    landLeaseId: z.string(),
    rateType: z.enum(LAND_LEASE_RATE_TYPES).optional(),
    contractedQuantity: z.number().positive().optional(),
    ratePerTrolley: z.number().positive().optional(),
    contractedAreaBigha: z.number().positive().optional(),
    ratePerBigha: z.number().positive().optional(),
    contractedDepth: z.number().positive().optional(),
    depthUnit: z.enum(LAND_LEASE_DEPTH_UNITS).optional(),
    ratePerDepthUnit: z.number().positive().optional(),
    totalContractValue: z.number().positive().optional(),
    advanceAmount: z.number().nonnegative().optional(),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    paymentTerms: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.advanceAmount ?? 0, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const contract = await createLandLeaseContract({
    ...input,
    kilnId: req.kiln!.id,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
  });
  res.status(201).json(contract);
}

export async function list(req: AuthedRequest, res: Response) {
  const statusQuery = req.query.status as string | undefined;
  const contracts = await listLandLeaseContracts(req.kiln!.id, {
    landLeaseId: req.query.landLeaseId as string | undefined,
    landId: req.query.landId as string | undefined,
    status: statusQuery ? z.enum(LAND_LEASE_CONTRACT_STATUSES).parse(statusQuery) : undefined,
  });
  const summaries = await Promise.all(
    contracts.map(async (c) => {
      const { contract, ...computed } = await getLandLeaseContractSummary(req.kiln!.id, c._id);
      return { ...c, ...computed };
    })
  );
  res.json(summaries);
}

export async function getOne(req: AuthedRequest, res: Response) {
  const summary = await getLandLeaseContractSummary(req.kiln!.id, req.params.id);
  res.json(summary);
}

// paymentMode/cashAmount/onlineAmount describe the delta if advanceAmount
// is raised — the cash+online-must-sum check happens in the service
// (updateLandLeaseContract) against that delta, same reasoning as
// soilContract.controller.ts's updateSchema.
const updateSchema = z.object({
  rateType: z.enum(LAND_LEASE_RATE_TYPES).optional(),
  contractedQuantity: z.number().positive().optional(),
  ratePerTrolley: z.number().positive().optional(),
  contractedAreaBigha: z.number().positive().optional(),
  ratePerBigha: z.number().positive().optional(),
  contractedDepth: z.number().positive().optional(),
  depthUnit: z.enum(LAND_LEASE_DEPTH_UNITS).optional(),
  ratePerDepthUnit: z.number().positive().optional(),
  totalContractValue: z.number().positive().optional(),
  advanceAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const contract = await updateLandLeaseContract(req.kiln!.id, req.params.id, {
    ...input,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
  });
  res.json(contract);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteLandLeaseContract(req.kiln!.id, req.params.id);
  res.status(204).send();
}

const statusSchema = z.object({ status: z.enum(LAND_LEASE_CONTRACT_STATUSES) });

export async function updateStatus(req: AuthedRequest, res: Response) {
  const input = statusSchema.parse(req.body);
  const contract = await updateLandLeaseContractStatus(req.kiln!.id, req.params.id, input.status);
  res.json(contract);
}

export async function expiringSoon(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const result = await landLeaseContractsExpiringSoon(req.kiln!.id, days);
  res.json(result);
}
