import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  contractorNetBalance,
  createPerson,
  customerCreditAging,
  getPersonFilePath,
  getPersonWithBalance,
  listOutstandingAdvances,
  listPaymentsDue,
  listPeople,
  mergeLedgers,
  personLedgerBalances,
  savePersonIdentityProof,
  savePersonPhoto,
  updatePerson,
} from "../services/person.service";
import { addLedgerEntry, listLedgerForPerson } from "../services/ledger.service";
import { getPersonFullReport } from "../services/report.service";
import {
  PERSON_STATUSES,
  PERSON_TYPES,
  SEX_OPTIONS,
  WORK_TYPES,
  LEDGER_CATEGORIES,
  LEDGER_PAYMENT_MODES,
  STACKING_STAGES,
  AGENT_COMMISSION_TYPES,
} from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

const personTypeSchema = z.enum(PERSON_TYPES);

const createSchema = z.object({
  type: personTypeSchema,
  name: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  idNumber: z.string().optional(),
  age: z.number().int().positive().optional(),
  sex: z.enum(SEX_OPTIONS).optional(),
  workType: z.enum(WORK_TYPES).optional(),
  notes: z.string().optional(),
  status: z.enum(PERSON_STATUSES).optional(),
  // Bug fix: these were all bare z.number().optional() — no
  // nonnegative()/positive() guard, so a negative wage/rate/salary could
  // be submitted via a direct API call, bypassing the client's own
  // min=0 hints entirely and silently corrupting every downstream wage/
  // commission/balance calculation built on these fields.
  dailyWage: z.number().nonnegative().optional(),
  ratePerThousand: z.number().nonnegative().optional(),
  contractorId: z.string().optional(),
  payType: z.enum(["MONTHLY", "PER_THOUSAND"]).optional(),
  commissionPerThousand: z.number().nonnegative().optional(),
  defaultRatePerThousand: z.number().nonnegative().optional(),
  bharaiRatePerThousand: z.number().nonnegative().optional(),
  monthlySalary: z.number().nonnegative().optional(),
  stackingStage: z.enum(STACKING_STAGES).optional(),
  bharaiContractorId: z.string().optional(),
  nikasiContractorId: z.string().optional(),
  pakayiContractorId: z.string().optional(),
  firingShiftAnchorDate: z.string().optional(),
  firingShiftAnchorType: z.enum(["DAY", "NIGHT"]).optional(),
  vehicleNumber: z.string().optional(),
  licenseNumber: z.string().optional(),
  ratePerTrolley: z.number().nonnegative().optional(),
  designation: z.string().optional(),
  isOfficeStaff: z.boolean().optional(),
  gstNumber: z.string().optional(),
  contractRate: z.number().nonnegative().optional(),
  contractUnit: z.string().optional(),
  partnershipDate: z.string().optional(),
  profitSharePercent: z.number().min(0).max(100).optional(),
  commissionType: z.enum(AGENT_COMMISSION_TYPES).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  monthlySalesTarget: z.number().nonnegative().optional(),
  referralCode: z.string().optional(),
  khetArea: z.number().nonnegative().optional(),
  khetAreaUnit: z.string().optional(),
  khetLocation: z.string().optional(),
  agreedDepthFeet: z.number().nonnegative().optional(),
  agreedDepthUnit: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  nickname: z.string().optional(),
  joiningDate: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

const ledgerSchema = z
  .object({
    direction: z.enum(["DUE", "PAID"]),
    amount: z.number().positive(),
    reason: z.string(),
    date: z.string().min(1, "Transaction date is required"),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    category: z.enum(LEDGER_CATEGORIES).optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amount, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const person = await createPerson({
    ...input,
    kilnId: req.kiln!.id,
    firingShiftAnchorDate: input.firingShiftAnchorDate ? new Date(input.firingShiftAnchorDate) : undefined,
    joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
    partnershipDate: input.partnershipDate ? new Date(input.partnershipDate) : undefined,
  });
  res.status(201).json(person);
}

export async function list(req: AuthedRequest, res: Response) {
  const type = req.query.type ? personTypeSchema.parse(req.query.type) : undefined;
  const people = await listPeople(req.kiln!.id, type);
  res.json(people);
}

export async function balances(req: AuthedRequest, res: Response) {
  const result = await personLedgerBalances(req.kiln!.id);
  res.json(result);
}

export async function advances(req: AuthedRequest, res: Response) {
  const result = await listOutstandingAdvances(req.kiln!.id);
  res.json(result);
}

export async function paymentsDue(req: AuthedRequest, res: Response) {
  const result = await listPaymentsDue(req.kiln!.id);
  res.json(result);
}

export async function creditAging(req: AuthedRequest, res: Response) {
  const result = await customerCreditAging(req.kiln!.id);
  res.json(result);
}

export async function getOne(req: AuthedRequest, res: Response) {
  const result = await getPersonWithBalance(req.kiln!.id, req.params.id);
  res.json(result);
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const person = await updatePerson(req.kiln!.id, req.params.id, {
    ...input,
    firingShiftAnchorDate: input.firingShiftAnchorDate ? new Date(input.firingShiftAnchorDate) : undefined,
    joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
    partnershipDate: input.partnershipDate ? new Date(input.partnershipDate) : undefined,
  });
  res.json(person);
}

export async function uploadPhoto(req: AuthedRequest & { file?: Express.Multer.File }, res: Response) {
  if (!req.file) return res.status(400).json({ error: "No photo file uploaded" });
  const person = await savePersonPhoto(req.kiln!.id, req.params.id, { buffer: req.file.buffer, originalname: req.file.originalname });
  res.json(person);
}

export async function uploadIdentityProof(req: AuthedRequest & { file?: Express.Multer.File }, res: Response) {
  if (!req.file) return res.status(400).json({ error: "No document file uploaded" });
  const person = await savePersonIdentityProof(req.kiln!.id, req.params.id, { buffer: req.file.buffer, originalname: req.file.originalname });
  res.json(person);
}

export async function getPhoto(req: AuthedRequest, res: Response) {
  const filePath = await getPersonFilePath(req.kiln!.id, req.params.id, "photoPath");
  if (!filePath) return res.status(404).json({ error: "No photo uploaded for this person" });
  res.sendFile(filePath);
}

export async function getIdentityProof(req: AuthedRequest, res: Response) {
  const filePath = await getPersonFilePath(req.kiln!.id, req.params.id, "identityProofPath");
  if (!filePath) return res.status(404).json({ error: "No identity proof uploaded for this person" });
  res.sendFile(filePath);
}

export async function addLedger(req: AuthedRequest, res: Response) {
  const input = ledgerSchema.parse(req.body);
  const entry = await addLedgerEntry({
    kilnId: req.kiln!.id,
    personId: req.params.id,
    direction: input.direction,
    amount: input.amount,
    reason: input.reason,
    date: input.date ? new Date(input.date) : undefined,
    paymentMode: input.paymentMode,
    cashAmount: input.cashAmount,
    onlineAmount: input.onlineAmount,
    category: input.category,
  });
  res.status(201).json(entry);
}

export async function listLedger(req: AuthedRequest, res: Response) {
  const entries = await listLedgerForPerson(req.kiln!.id, req.params.id);
  res.json(entries);
}

export async function contractorBalance(req: AuthedRequest, res: Response) {
  const result = await contractorNetBalance(req.kiln!.id, req.params.id);
  res.json(result);
}

export async function report(req: AuthedRequest, res: Response) {
  const result = await getPersonFullReport(req.kiln!.id, req.params.id);
  res.json(result);
}

const mergeSchema = z.object({ intoPersonId: z.string() });

export async function merge(req: AuthedRequest, res: Response) {
  const { intoPersonId } = mergeSchema.parse(req.body);
  res.json(await mergeLedgers(req.kiln!.id, req.params.id, intoPersonId));
}

