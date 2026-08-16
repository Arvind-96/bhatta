import { getIO } from "../config/socket";

// Central place to register any additional server-initiated socket behaviour
// beyond the join/leave room handling already wired in config/socket.ts.
export function registerSocketHandlers() {
  const io = getIO();

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {
      // room membership is cleaned up automatically by socket.io
    });
  });
}
