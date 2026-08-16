import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { asc, eq } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/client";
import { kilns } from "../db/schema";

export interface AuthedRequest extends Request {
  user?: { id: string };
  kiln?: { id: string; role: "OWNER" | "MANAGER" | "MUNIM" };
}

// The app runs without a login screen — every visitor gets straight into
// the single kiln this deployment manages (see resolveKiln below). A
// bearer token is decoded if one happens to be present (kept for any
// dormant auth-gated route that still reads req.user), but its absence or
// invalidity never blocks a request.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice("Bearer ".length), env.jwtSecret) as AuthedRequest["user"];
    } catch {
      // stale/invalid token — proceed anonymously rather than rejecting
    }
  }
  next();
}

// With no login, there's no user to own a membership check. An X-Kiln-Id
// header is honored if it names a real kiln (keeps the header meaningful
// for anyone scripting against the API directly); otherwise this falls
// back to the earliest-created kiln, which is this deployment's one real
// bhatta.
export async function resolveKiln(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const requestedKilnId = req.header("X-Kiln-Id");
    const requested = requestedKilnId
      ? db.select({ _id: kilns._id }).from(kilns).where(eq(kilns._id, requestedKilnId)).get()
      : undefined;

    const kilnId = requested?._id ?? db.select({ _id: kilns._id }).from(kilns).orderBy(asc(kilns.createdAt)).get()?._id;
    if (!kilnId) {
      return res.status(500).json({ error: "No kiln configured yet" });
    }

    req.kiln = { id: kilnId, role: "OWNER" };
    next();
  } catch (err) {
    next(err);
  }
}
