import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/store/auth.store";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      // Re-invoked on every (re)connection attempt, so it always carries
      // the current token/kiln — no need to recreate the client just
      // because the active kiln changed.
      auth: (cb) => {
        const { token, activeKilnId } = useAuthStore.getState();
        cb({ token, kilnId: activeKilnId });
      },
    });
  }
  return socket;
}

// Used when the active kiln changes: forces a fresh handshake (server
// re-runs its auth check with the new kilnId) on the *same* Socket
// instance, so every `useKilnEvent` listener already attached to it stays
// registered — nothing goes silently stale the way it would if the whole
// client were torn down and rebuilt.
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

// Used on logout: fully tears down the connection and the singleton so the
// next login starts from a clean client instead of reusing one that still
// has the previous account's listeners and auth history attached.
export function destroySocket() {
  socket?.disconnect();
  socket = null;
}
