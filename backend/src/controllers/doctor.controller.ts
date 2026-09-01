import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createDoctor, deleteDoctor, listDoctors, updateDoctor } from "../services/doctor.service";

const createDoctorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  qualification: z.string().optional(),
  clinicAddress: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createDoctorSchema.parse(req.body);
  const doctor = await createDoctor({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(doctor);
}

export async function list(req: AuthedRequest, res: Response) {
  res.json(await listDoctors(req.kiln!.id));
}

const updateDoctorSchema = createDoctorSchema.partial().extend({ active: z.boolean().optional() });

export async function update(req: AuthedRequest, res: Response) {
  const input = updateDoctorSchema.parse(req.body);
  const doctor = await updateDoctor(req.kiln!.id, req.params.id, input);
  res.json(doctor);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteDoctor(req.kiln!.id, req.params.id);
  res.status(204).end();
}
