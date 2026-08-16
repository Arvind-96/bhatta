import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/client";
import { kilnMemberships } from "../db/schema";

export interface AuthedRequest extends Request {
  user?: { id: string };
  kiln?: { id: string; role: "OWNER" | "MANAGER" | "MUNIM" };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const token = header.slice("Bearer ".length);
    req.user = jwt.verify(token, env.jwtSecret) as AuthedRequest["user"];
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Every request scoped to a specific bhatta carries an X-Kiln-Id header —
// an owner can belong to several kilns, so the JWT alone can't say which
// one a request is for. This looks up the membership and rejects anything
// the user doesn't actually belong to.
export async function resolveKiln(req: AuthedRequest, res: Response, next: NextFunction) {
  const kilnId = req.header("X-Kiln-Id");
  if (!kilnId) {
    return res.status(400).json({ error: "Missing X-Kiln-Id header" });
  }

  try {
    const membership = db
      .select()
      .from(kilnMemberships)
      .where(and(eq(kilnMemberships.userId, req.user!.id), eq(kilnMemberships.kilnId, kilnId)))
      .get();
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this kiln" });
    }

    req.kiln = { id: kilnId, role: membership.role as "OWNER" | "MANAGER" | "MUNIM" };
    next();
  } catch (err) {
    next(err);
  }
}
