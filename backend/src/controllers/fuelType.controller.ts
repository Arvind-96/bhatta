import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createFuelType, deleteFuelType, listFuelTypes } from "../services/fuelType.service";

const createSchema = z.object({
  name: z.string().min(1),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const fuelType = await createFuelType(req.kiln!.id, input.name);
  res.status(201).json(fuelType);
}

export async function list(req: AuthedRequest, res: Response) {
  const fuelTypes = await listFuelTypes(req.kiln!.id);
  res.json(fuelTypes);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteFuelType(req.kiln!.id, req.params.id);
  res.status(204).end();
}
