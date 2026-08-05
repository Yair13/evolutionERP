import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet } from "../api/client.js";
import { useAuth } from "./AuthContext.js";
import type { WarehouseOption } from "../features/inventory/inventory.types.js";

const STORAGE_KEY = "evolution_erp_warehouse";
/** Sentinel en localStorage para sesión "Todas las sedes". */
const ALL_SENTINEL = "__all__";
const UNRESTRICTED_ROLES = new Set(["super_admin", "secretaria"]);

type WarehouseContextValue = {
  warehouses: WarehouseOption[];
  /** null = sesión "Todas las sedes" (solo admin/secretaria). */
  warehouseId: string | null;
  /** true cuando la sesión mira todas las sedes. */
  isAllWarehouses: boolean;
  /** Puede elegir "Todas" y cambiar libremente entre sedes. */
  canViewAllWarehouses: boolean;
  setWarehouseId: (id: string | null) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Etiqueta legible de la sesión actual. */
  sessionLabel: string;
};

const WarehouseContext = createContext<WarehouseContextValue | null>(null);

function readStoredWarehouseId(): string | null | typeof ALL_SENTINEL {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return raw;
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseIdState] = useState<string | null>(() => {
    const stored = readStoredWarehouseId();
    if (stored === ALL_SENTINEL) return null;
    return stored;
  });
  /** Distingue "Todas" (null intencional) de "aún no cargó". */
  const [allMode, setAllMode] = useState(() => readStoredWarehouseId() === ALL_SENTINEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canViewAllWarehouses =
    user?.warehouseIds == null || (user?.roles ?? []).some((r) => UNRESTRICTED_ROLES.has(r));

  const reload = useCallback(async () => {
    if (!token) {
      setWarehouses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: WarehouseOption[] }>("/warehouses", token);
      const active = data.items.filter((w) => w.is_active);
      setWarehouses(active);

      setWarehouseIdState((prev) => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === ALL_SENTINEL && canViewAllWarehouses) {
          setAllMode(true);
          return null;
        }
        if (prev && active.some((w) => w.id === prev)) {
          setAllMode(false);
          return prev;
        }
        if (stored && stored !== ALL_SENTINEL && active.some((w) => w.id === stored)) {
          setAllMode(false);
          return stored;
        }
        // Usuario con una sola sede: fijarla
        const assigned = user?.warehouseIds;
        if (assigned?.length === 1 && active.some((w) => w.id === assigned[0])) {
          localStorage.setItem(STORAGE_KEY, assigned[0]!);
          setAllMode(false);
          return assigned[0]!;
        }
        if (canViewAllWarehouses) {
          localStorage.setItem(STORAGE_KEY, ALL_SENTINEL);
          setAllMode(true);
          return null;
        }
        const next = active[0]?.id ?? null;
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
        setAllMode(false);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, canViewAllWarehouses, user?.warehouseIds]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Si pierde permiso de "Todas", salir de allMode
  useEffect(() => {
    if (!canViewAllWarehouses && allMode) {
      const first = warehouses[0]?.id ?? null;
      if (first) {
        localStorage.setItem(STORAGE_KEY, first);
        setWarehouseIdState(first);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setWarehouseIdState(null);
      }
      setAllMode(false);
    }
  }, [canViewAllWarehouses, allMode, warehouses]);

  const setWarehouseId = useCallback(
    (id: string | null) => {
      if (id == null) {
        if (!canViewAllWarehouses) return;
        localStorage.setItem(STORAGE_KEY, ALL_SENTINEL);
        setAllMode(true);
        setWarehouseIdState(null);
        return;
      }
      localStorage.setItem(STORAGE_KEY, id);
      setAllMode(false);
      setWarehouseIdState(id);
    },
    [canViewAllWarehouses]
  );

  const isAllWarehouses = canViewAllWarehouses && allMode;

  const sessionLabel = useMemo(() => {
    if (isAllWarehouses) return "Todas las sedes";
    const w = warehouses.find((x) => x.id === warehouseId);
    if (!w) return "Sede";
    return w.is_factory ? `${w.name} · Fábrica` : w.name;
  }, [isAllWarehouses, warehouses, warehouseId]);

  const value = useMemo(
    () => ({
      warehouses,
      warehouseId: isAllWarehouses ? null : warehouseId,
      isAllWarehouses,
      canViewAllWarehouses,
      setWarehouseId,
      loading,
      error,
      reload,
      sessionLabel,
    }),
    [
      warehouses,
      warehouseId,
      isAllWarehouses,
      canViewAllWarehouses,
      setWarehouseId,
      loading,
      error,
      reload,
      sessionLabel,
    ]
  );

  return <WarehouseContext.Provider value={value}>{children}</WarehouseContext.Provider>;
}

export function useWarehouse(): WarehouseContextValue {
  const ctx = useContext(WarehouseContext);
  if (!ctx) throw new Error("useWarehouse debe usarse dentro de WarehouseProvider");
  return ctx;
}
