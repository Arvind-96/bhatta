import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { asc, eq } from "drizzle-orm";
import { isAllowedOrigin } from "./env";
import { db } from "../db/client";
import { kilns } from "../db/schema";

let io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    },
  });

  // No login, so no membership to verify — a kilnId is honored if it names
  // a real kiln, otherwise the socket joins the default (earliest-created)
  // kiln's room, mirroring resolveKiln's HTTP-side fallback.
  io.use(async (socket, next) => {
    try {
      const { kilnId } = socket.handshake.auth as { kilnId?: string };
      const requested = kilnId ? (await db.select({ _id: kilns._id }).from(kilns).where(eq(kilns._id, kilnId)))[0] : undefined;
      const resolvedKilnId = requested?._id ?? (await db.select({ _id: kilns._id }).from(kilns).orderBy(asc(kilns.createdAt)))[0]?._id;
      if (!resolvedKilnId) throw new Error("No kiln configured yet");

      socket.data.kilnId = resolvedKilnId;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error("Unauthorized"));
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
