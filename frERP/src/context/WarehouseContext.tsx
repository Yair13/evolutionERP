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
/** Sentinel en localStorage para sesión "Sede Administrativa" (vista global). */
const ALL_SENTINEL = "__all__";
const UNRESTRICTED_ROLES = new Set(["super_admin", "secretaria"]);

type WarehouseContextValue = {
  /** Todas las sedes activas de la empresa (para traslados, búsquedas, nombres). */
  warehouses: WarehouseOption[];
  /** Sedes a las que el usuario actual tiene permiso de operar / seleccionar como sesión. */
  assignedWarehouses: WarehouseOption[];
  /** null = sesión "Sede Administrativa" (solo admin/secretaria) o aún sin seleccionar. */
  warehouseId: string | null;
  /** true cuando la sesión está en la Sede Administrativa (vista general de empresa). */
  isAllWarehouses: boolean;
  /** true cuando el usuario ya eligió sede (o Sede Administrativa) para su sesión. */
  hasSelectedScope: boolean;
  /** Puede elegir "Sede Administrativa" y cambiar libremente entre sedes. */
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
  /** Distingue "Sede Administrativa" (null intencional) de "aún no eligió sede". */
  const [allMode, setAllMode] = useState(() => readStoredWarehouseId() === ALL_SENTINEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canViewAllWarehouses = Boolean(
    (user?.roles ?? []).includes("super_admin") ||
      (user?.hasAdminAccess ?? (user?.roles ?? []).some((r) => UNRESTRICTED_ROLES.has(r)))
  );

  const warehouseIdsKey = Array.isArray(user?.warehouseIds)
    ? user.warehouseIds.slice().sort().join(",")
    : "";

  const assignedWarehouses = useMemo(() => {
    if (canViewAllWarehouses || user?.warehouseIds === null || user?.warehouseIds === undefined) {
      return warehouses;
    }
    const allowed = new Set(user.warehouseIds);
    return warehouses.filter((w) => allowed.has(w.id));
  }, [warehouses, canViewAllWarehouses, warehouseIdsKey]);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) {
      setWarehouses([]);
      setWarehouseIdState(null);
      setAllMode(false);
      setLoading(false);
      return;
    }
    // NUNCA poner loading=true en recargas posteriores para no desmontar los modales en pantalla
    setLoading((prevLoading) => (opts?.silent ? false : prevLoading));
    setError(null);
    try {
      const data = await apiGet<{ items: WarehouseOption[] }>("/warehouses", token);
      const active = data.items.filter((w) => w.is_active);
      setWarehouses(active);

      const assigned =
        canViewAllWarehouses || user?.warehouseIds === null || user?.warehouseIds === undefined
          ? active
          : active.filter((w) => new Set(user.warehouseIds).has(w.id));

      setWarehouseIdState((prev) => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === ALL_SENTINEL && canViewAllWarehouses) {
          setAllMode(true);
          return null;
        }
        if (stored && stored !== ALL_SENTINEL && assigned.some((w) => w.id === stored)) {
          setAllMode(false);
          return stored;
        }
        // Conservar la sede actual si sigue siendo válida para el usuario
        if (prev && assigned.some((w) => w.id === prev)) {
          return prev;
        }
        // Usuario normal con una sola sede asignada: entrar directo a esa sede
        if (!canViewAllWarehouses && assigned.length === 1) {
          const onlyId = assigned[0]!.id;
          localStorage.setItem(STORAGE_KEY, onlyId);
          setAllMode(false);
          return onlyId;
        }
        // Si no se encuentra la sede, solo resetear si no había previa
        if (!prev) {
          localStorage.removeItem(STORAGE_KEY);
          setAllMode(false);
          return null;
        }
        return prev;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, canViewAllWarehouses, warehouseIdsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Si pierde permiso de "Sede Administrativa", salir de allMode
  useEffect(() => {
    if (!canViewAllWarehouses && allMode) {
      if (assignedWarehouses.length === 1) {
        const first = assignedWarehouses[0]!.id;
        localStorage.setItem(STORAGE_KEY, first);
        setWarehouseIdState(first);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setWarehouseIdState(null);
      }
      setAllMode(false);
    }
  }, [canViewAllWarehouses, allMode, assignedWarehouses]);

  const setWarehouseId = useCallback(
    (id: string | null) => {
      if (id == null) {
        if (!canViewAllWarehouses) return;
        localStorage.setItem(STORAGE_KEY, ALL_SENTINEL);
        setAllMode(true);
        setWarehouseIdState(null);
        return;
      }
      if (!canViewAllWarehouses && !assignedWarehouses.some((w) => w.id === id)) {
        return;
      }
      localStorage.setItem(STORAGE_KEY, id);
      setAllMode(false);
      setWarehouseIdState(id);
    },
    [canViewAllWarehouses, assignedWarehouses]
  );

  const isAllWarehouses = canViewAllWarehouses && allMode;
  const hasSelectedScope = Boolean(
    isAllWarehouses || (warehouseId && assignedWarehouses.some((w) => w.id === warehouseId))
  );

  const sessionLabel = useMemo(() => {
    if (isAllWarehouses) return "Sede Administrativa";
    const w = warehouses.find((x) => x.id === warehouseId);
    if (!w) return "Sede";
    return w.is_factory ? `${w.name} · Fábrica` : w.name;
  }, [isAllWarehouses, warehouses, warehouseId]);

  const value = useMemo(
    () => ({
      warehouses,
      assignedWarehouses,
      warehouseId: isAllWarehouses ? null : warehouseId,
      isAllWarehouses,
      hasSelectedScope,
      canViewAllWarehouses,
      setWarehouseId,
      loading,
      error,
      reload,
      sessionLabel,
    }),
    [
      warehouses,
      assignedWarehouses,
      warehouseId,
      isAllWarehouses,
      hasSelectedScope,
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
