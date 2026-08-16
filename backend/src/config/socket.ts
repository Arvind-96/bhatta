import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { env } from "./env";
import { db } from "../db/client";
import { kilnMemberships } from "../db/schema";

let io: SocketServer | null = null;

interface SocketAuthPayload {
  id: string;
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  // The client picks which of its kilns is "active" and sends it in the
  // handshake; we verify membership here rather than trusting it, so a
  // socket can never join a room for a kiln the user doesn't belong to.
  io.use(async (socket, next) => {
    try {
      const { token, kilnId } = socket.handshake.auth as { token?: string; kilnId?: string };
      if (!token || !kilnId) throw new Error("Missing auth token or kilnId");

      const payload = jwt.verify(token, env.jwtSecret) as SocketAuthPayload;
      const membership = db
        .select()
        .from(kilnMemberships)
        .where(and(eq(kilnMemberships.userId, payload.id), eq(kilnMemberships.kilnId, kilnId)))
        .get();
      if (!membership) throw new Error("Not a member of this kiln");

      socket.data.kilnId = kilnId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`kiln:${socket.data.kilnId}`);
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized yet");
  return io;
}

// Safe no-op when called outside a running server (e.g. one-off scripts) —
// in the real app io is always initialized before any request handler runs.
export function emitToKiln(kilnId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`kiln:${kilnId}`).emit(event, payload);
}
