import { useEffect } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useDashboardStore } from "@/store/dashboard.store";
import { useAuthStore } from "@/store/auth.store";
import type { ProductionLog, StockPoint } from "@/types";

export function useLiveProduction() {
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const resetForKilnSwitch = useDashboardStore((s) => s.resetForKilnSwitch);
  const setProductionSeries = useDashboardStore((s) => s.setProductionSeries);
  const setStock = useDashboardStore((s) => s.setStock);
  const setTodayProduction = useDashboardStore((s) => s.setTodayProduction);
  const ingestProductionUpdate = useDashboardStore((s) => s.ingestProductionUpdate);
  const ingestStockUpdate = useDashboardStore((s) => s.ingestStockUpdate);

  useEffect(() => {
    if (!activeKilnId) return;
    resetForKilnSwitch();
    api.production.series().then(setProductionSeries).catch(console.error);
    api.stock.snapshot().then(setStock).catch(console.error);
    api.production.today().then(setTodayProduction).catch(console.error);
  }, [activeKilnId, resetForKilnSwitch, setProductionSeries, setStock, setTodayProduction]);

  useEffect(() => {
    const socket = getSocket();

    const onProduction = (log: ProductionLog) => ingestProductionUpdate(log);
    const onStock = (entry: StockPoint) => ingestStockUpdate(entry);

    socket.on("production:update", onProduction);
    socket.on("stock:update", onStock);

    return () => {
      socket.off("production:update", onProduction);
      socket.off("stock:update", onStock);
    };
  }, [ingestProductionUpdate, ingestStockUpdate]);
}
