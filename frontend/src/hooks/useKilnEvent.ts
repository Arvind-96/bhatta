import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

// Subscribes to a kiln-scoped socket event for the lifetime of the
// component. Keeps the latest handler in a ref rather than the effect's
// dependency array so passing an inline arrow function (the common case —
// `useKilnEvent("soilTrip:update", refresh)`) doesn't tear down and
// resubscribe the socket listener on every render.
//
// Safe across kiln switches: useSocket() reconnects the *same* underlying
// Socket instance (see lib/socket.ts) rather than replacing it, so a
// listener attached here at mount keeps receiving events after the user
// switches bhattas without needing to know that happened.
export function useKilnEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
