import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createDoctorVisit, deleteDoctorVisit, listDoctorVisits, updateDoctorVisit } from "../services/doctorVisit.service";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";

const createDoctorVisitSchema = z.object({
  doctorId: z.string().min(1),
  personId: z.string().min(1),
  ailment: z.string().optional(),
  medicineCost: z.number().min(0).optional(),
  consultationFee: z.number().min(0).optional(),
  paymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createDoctorVisitSchema.parse(req.body);
  const visit = await createDoctorVisit({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(visit);
}

export async function list(req: AuthedRequest, res: Response) {
  const { doctorId, personId } = req.query as { doctorId?: string; personId?: string };
  res.json(await listDoctorVisits(req.kiln!.id, { doctorId, personId }));
}

const updateDoctorVisitSchema = z.object({
  ailment: z.string().optional(),
  medicineCost: z.number().min(0).optional(),
  consultationFee: z.number().min(0).optional(),
  paymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
  cashAmount: z.number().min(0).optional(),
  onlineAmount: z.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateDoctorVisitSchema.parse(req.body);
  const visit = await updateDoctorVisit(req.kiln!.id, req.params.id, {
    ...input,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.json(visit);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteDoctorVisit(req.kiln!.id, req.params.id);
  res.status(204).end();
}
