import { create } from "zustand";
import type { ProductionLog, ProductionSeriesPoint, StockPoint } from "@/types";

export type ConnectionStatus = "connecting" | "online" | "offline";

interface DashboardState {
  connectionStatus: ConnectionStatus;
  productionSeries: ProductionSeriesPoint[];
  stock: StockPoint[];
  recentActivity: ProductionLog[];
  todayBricks: number;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setProductionSeries: (series: ProductionSeriesPoint[]) => void;
  setStock: (stock: StockPoint[]) => void;
  setTodayProduction: (logs: ProductionLog[]) => void;
  ingestProductionUpdate: (log: ProductionLog) => void;
  ingestStockUpdate: (entry: StockPoint) => void;
  resetForKilnSwitch: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  connectionStatus: "connecting",
  productionSeries: [],
  stock: [],
  recentActivity: [],
  todayBricks: 0,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setProductionSeries: (series) => set({ productionSeries: series }),
  setStock: (stock) => set({ stock }),

  // Seeds today's already-fired batches on load/kiln-switch — without this
  // the Live Activity feed and "Bricks Today" stat stay empty until the
  // next socket event arrives, even though the day's production already
  // happened before the dashboard was opened.
  setTodayProduction: (logs) =>
    set({
      recentActivity: [...logs].sort((a, b) => b.producedOn.localeCompare(a.producedOn)).slice(0, 20),
      todayBricks: logs.reduce((sum, l) => sum + l.bricksCount, 0),
    }),

  ingestProductionUpdate: (log) =>
    set((state) => {
      const today = new Date().toISOString().slice(0, 10);
      const producedDay = log.producedOn.slice(0, 10);
      const series = [...state.productionSeries];
      const idx = series.findIndex((p) => p.date === producedDay);
      if (idx >= 0) {
        series[idx] = { ...series[idx], bricks: series[idx].bricks + log.bricksCount };
      } else {
        series.push({ date: producedDay, bricks: log.bricksCount });
      }

      return {
        productionSeries: series,
        recentActivity: [log, ...state.recentActivity].slice(0, 20),
        todayBricks:
          producedDay === today ? state.todayBricks + log.bricksCount : state.todayBricks,
      };
    }),

  ingestStockUpdate: (entry) =>
    set((state) => {
      const stock = [...state.stock];
      const idx = stock.findIndex((s) => s.itemName === entry.itemName);
      if (idx >= 0) stock[idx] = entry;
      else stock.push(entry);
      return { stock };
    }),

  resetForKilnSwitch: () =>
    set({ productionSeries: [], stock: [], recentActivity: [], todayBricks: 0, connectionStatus: "connecting" }),
}));
