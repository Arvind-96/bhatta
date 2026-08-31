import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { and, asc, eq } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/client";
import { kilns, seasons } from "../db/schema";

export interface AuthedRequest extends Request {
  user?: { id: string };
  kiln?: { id: string; role: "OWNER" | "MANAGER" | "MUNIM" };
  season?: { id: string; isCurrent: boolean };
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
      ? (await db.select({ _id: kilns._id }).from(kilns).where(eq(kilns._id, requestedKilnId)))[0]
      : undefined;

    const kilnId = requested?._id ?? (await db.select({ _id: kilns._id }).from(kilns).orderBy(asc(kilns.createdAt)))[0]?._id;
    if (!kilnId) {
      return res.status(500).json({ error: "No kiln configured yet" });
    }

    req.kiln = { id: kilnId, role: "OWNER" };
    next();
  } catch (err) {
    next(err);
  }
}

// Mirrors resolveKiln exactly, one level narrower — must run after
// resolveKiln (needs req.kiln.id). An X-Season-Id header is honored if it
// names a real season under this kiln; otherwise falls back to whichever
// season is currently marked isCurrent, NOT earliest-created (unlike
// resolveKiln's fallback) — "current" must always be the sensible default
// so the app behaves exactly as it did before seasons existed until an
// admin deliberately switches away. Only mounted on routers for tables
// that are actually season-scoped (see db/schema/season.ts's doc comment)
// — master-data routers (people, customers, suppliers, ...) never call
// this, since req.season would simply go unused there.
export async function resolveSeason(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const requestedSeasonId = req.header("X-Season-Id");
    const requested = requestedSeasonId
      ? (await db.select({ _id: seasons._id, isCurrent: seasons.isCurrent }).from(seasons).where(and(eq(seasons._id, requestedSeasonId), eq(seasons.kilnId, req.kiln!.id))))[0]
      : undefined;

    const current = requested
      ? undefined
      : (await db.select({ _id: seasons._id, isCurrent: seasons.isCurrent }).from(seasons).where(and(eq(seasons.kilnId, req.kiln!.id), eq(seasons.isCurrent, true))))[0];

    const resolved = requested ?? current;
    if (!resolved) {
      return res.status(500).json({ error: "No season configured yet" });
    }

    req.season = { id: resolved._id, isCurrent: resolved.isCurrent };
    next();
  } catch (err) {
    next(err);
  }
}

// Blocks any write against an archived (non-current) season — the actual
// enforcement behind "past seasons are read-only." Centralized here rather
// than disabled buttons across 40+ forms: every existing form already
// generically surfaces a thrown request error, so this alone is both
// necessary and sufficient. Mounted right after resolveSeason.
export function blockWritesOnArchivedSeason(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.season && !req.season.isCurrent) {
    return res.status(403).json({ error: "This season is archived and read-only — switch to the current season to make changes." });
  }
  next();
}
