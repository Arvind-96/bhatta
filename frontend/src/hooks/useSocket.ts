import { useEffect } from "react";
import { getSocket, reconnectSocket } from "@/lib/socket";
import { useDashboardStore } from "@/store/dashboard.store";
import { useAuthStore } from "@/store/auth.store";

// Room membership is derived from activeKilnId on the server
// (config/socket.ts) — switching the active kiln forces a fresh handshake
// on the *same* client instance (reconnectSocket), not a new one, so every
// useKilnEvent listener already attached elsewhere in the app stays live.
export function useSocket() {
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setConnectionStatus = useDashboardStore((s) => s.setConnectionStatus);

  useEffect(() => {
    if (!activeKilnId) return;

    const socket = getSocket();

    const handleConnect = () => setConnectionStatus("online");
    const handleDisconnect = () => setConnectionStatus("offline");

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleDisconnect);

    reconnectSocket();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleDisconnect);
    };
  }, [activeKilnId, setConnectionStatus]);
}
