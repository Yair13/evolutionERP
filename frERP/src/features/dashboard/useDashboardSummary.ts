import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import type { DashboardSummary } from "./dashboard.types.js";

type State =
  | { status: "idle" | "loading" }
  | { status: "ok"; data: DashboardSummary }
  | { status: "error"; message: string };

export function useDashboardSummary(token: string | null, warehouseId?: string | null) {
  const [state, setState] = useState<State>({ status: "idle" });

  const reload = useCallback(async () => {
    if (!token) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    try {
      const path = warehouseId
        ? `/dashboard/summary?warehouseId=${encodeURIComponent(warehouseId)}`
        : "/dashboard/summary";
      const data = await apiGet<DashboardSummary>(path, token);
      setState({ status: "ok", data });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Error" });
    }
  }, [token, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
