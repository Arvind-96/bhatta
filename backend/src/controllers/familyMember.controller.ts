import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createFamilyMember,
  deleteFamilyMember,
  getFamilyForPerson,
  listFamilyMembers,
  updateFamilyMember,
} from "../services/familyMember.service";
import { FAMILY_RELATIONS, SEX_OPTIONS } from "../db/schema";

const createSchema = z.object({
  headPersonId: z.string(),
  name: z.string(),
  relation: z.enum(FAMILY_RELATIONS),
  age: z.number().int().positive().optional(),
  sex: z.enum(SEX_OPTIONS).optional(),
  isWorking: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const member = await createFamilyMember({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(member);
}

export async function list(req: AuthedRequest, res: Response) {
  const headPersonId = req.query.headPersonId as string | undefined;
  if (!headPersonId) return res.json([]);
  const members = await listFamilyMembers(req.kiln!.id, headPersonId);
  res.json(members);
}

export async function familyForPerson(req: AuthedRequest, res: Response) {
  const result = await getFamilyForPerson(req.kiln!.id, req.params.personId);
  res.json(result);
}

const updateSchema = z.object({
  name: z.string().optional(),
  relation: z.enum(FAMILY_RELATIONS).optional(),
  age: z.number().int().positive().optional(),
  sex: z.enum(SEX_OPTIONS).optional(),
  isWorking: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const member = await updateFamilyMember(req.kiln!.id, req.params.id, input);
  res.json(member);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteFamilyMember(req.kiln!.id, req.params.id);
  res.status(204).end();
}
