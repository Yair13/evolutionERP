export type DashboardSummary = {
  generatedAt: string;
  scope: "all" | "warehouses";
  kpis: {
    activeWarehouses: number;
    activeProducts: number;
    movementsToday: number;
    movementsLast7Days: number;
    stockLocationsTracked: number;
    attentionLowStock: number;
  };
  movementTrend: { date: string; count: number }[];
  recentMovements: {
    id: string;
    at: string;
    type: string;
    quantity: string;
    productRef: string;
    productName: string;
    warehouseCode: string;
    warehouseName: string;
  }[];
  snapshotWarehouses: { id: string; code: string; name: string }[];
};

export type HealthResponse = {
  ok: boolean;
  service: string;
  database: { ok: true; latencyMs: number } | { ok: false; error: string } | { skipped: true };
};
