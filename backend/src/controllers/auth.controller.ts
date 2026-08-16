import { Response } from "express";
import { z } from "zod";
import { changePassword, getCurrentUser, loginUser, registerUser } from "../services/auth.service";
import { AuthedRequest } from "../middleware/auth.middleware";

const registerSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["OWNER", "MANAGER", "MUNIM"]).optional(),
  kilnId: z.string().optional(),
  kilnName: z.string().optional(),
  kilnLocation: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function register(req: AuthedRequest, res: Response) {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}

export async function login(req: AuthedRequest, res: Response) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input.email, input.password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
}

export async function me(req: AuthedRequest, res: Response) {
  const result = await getCurrentUser(req.user!.id);
  res.json(result);
}

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
});

export async function updatePassword(req: AuthedRequest, res: Response) {
  try {
    const input = changePasswordSchema.parse(req.body);
    await changePassword(req.user!.id, input.currentPassword, input.newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}
