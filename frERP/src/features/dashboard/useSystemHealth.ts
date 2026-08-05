import { useEffect, useState } from "react";
import { apiGetPublic } from "../../api/client.js";
import type { HealthResponse } from "./dashboard.types.js";

type HealthState = { status: "loading" | "ok" | "error"; payload?: HealthResponse; message?: string };

export function useSystemHealth() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await apiGetPublic<HealthResponse>("/health");
        if (!cancelled) setState({ status: "ok", payload });
      } catch (err) {
        if (!cancelled)
          setState({ status: "error", message: err instanceof Error ? err.message : "Sin conexión" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
