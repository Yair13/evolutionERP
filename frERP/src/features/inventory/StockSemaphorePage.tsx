import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownToLine } from "lucide-react";
import { fetchStockSemaphore, fetchStockSemaphoreSummary } from "../../api/inventory.js";
import { InvScopeBar } from "../../components/inventory/InvScopeBar.js";
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { ProductCard } from "../../components/inventory/ProductCard.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import type { CatalogItem, StockSemaphoreSummary, StockSignal } from "./inventory.types.js";

type FilterKey = "attention" | StockSignal;

const FILTERS: { key: FilterKey; label: string; signal?: StockSignal }[] = [
  { key: "attention", label: "Requieren atención" },
  { key: "critical", label: "Crítico", signal: "critical" },
  { key: "low", label: "Stock bajo", signal: "low" },
  { key: "out", label: "Sin stock", signal: "out" },
  { key: "ok", label: "En stock", signal: "ok" },
];

function parseFilter(param: string | null): FilterKey {
  if (param === "ok" || param === "low" || param === "critical" || param === "out") return param;
  return "attention";
}

export function StockSemaphorePage() {
  const { token } = useAuth();
  const { warehouseId, warehouses, isAllWarehouses } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = parseFilter(searchParams.get("estado"));
  const [summary, setSummary] = useState<StockSemaphoreSummary | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sedeName = warehouses.find((w) => w.id === warehouseId)?.name;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;
  const returnTo = `/app/inventario/semaforo${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const setFilter = (key: FilterKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === "attention") next.delete("estado");
    else next.set("estado", key);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!token || !warehouseId) {
      setSummary(null);
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [sumRes, listRes] = await Promise.all([
        fetchStockSemaphoreSummary(token, warehouseId),
        fetchStockSemaphore(token, warehouseId, {
          signal: activeFilter.signal,
          limit: 60,
        }),
      ]);
      setSummary(sumRes.summary);
      setItems(listRes.items);
      setTotal(listRes.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, warehouseId, activeFilter.signal]);

  useEffect(() => {
    void load();
  }, [load]);

  const attentionTotal = useMemo(() => {
    if (!summary) return 0;
    return summary.critical + summary.low + summary.out;
  }, [summary]);

  const kpiCards = useMemo(() => {
    if (!summary) return [];
    return [
      { key: "ok" as const, label: "En stock", count: summary.ok, hint: "Nivel normal" },
      { key: "low" as const, label: "Stock bajo", count: summary.low, hint: "Bajo mínimo" },
      { key: "critical" as const, label: "Crítico", count: summary.critical, hint: "Bajo crítico" },
      { key: "out" as const, label: "Sin stock", count: summary.out, hint: "Cantidad cero" },
    ];
  }, [summary]);

  return (
    <div className="inv-page">
      <InventoryPageHeader
        backTo="/app/inventario"
        title="Alertas de stock"
        description={
          isAllWarehouses
            ? "Sesión en todas las sedes · elige una sede para ver alertas por almacén"
            : sedeName
              ? `Estado de existencias en ${sedeName} · ${summary?.total ?? "…"} productos activos`
              : "Elige una sede para ver alertas de stock por almacén"
        }
        scope={<InvScopeBar focus="stock" allowAllWarehouses />}
        actions={
          <Link to="/app/inventario/entrada" className="inv-btn inv-btn--primary">
            <ArrowDownToLine size={18} strokeWidth={2} aria-hidden />
            Entrada de stock
          </Link>
        }
      />

      {summary ? (
        <div className="inv-semaphore" role="region" aria-label="Resumen de alertas de stock por sede">
          <div className="inv-semaphore__kpis">
            {kpiCards.map((k) => (
              <button
                key={k.key}
                type="button"
                className={`inv-semaphore__kpi inv-semaphore__kpi--${k.key}${filter === k.key ? " is-active" : ""}`}
                onClick={() => setFilter(k.key)}
              >
                <span className="inv-semaphore__kpi-dot" aria-hidden />
                <span className="inv-semaphore__kpi-count">{k.count}</span>
                <span className="inv-semaphore__kpi-label">{k.label}</span>
                <span className="inv-semaphore__kpi-hint">{k.hint}</span>
              </button>
            ))}
          </div>
          <p className="inv-semaphore__legend">
            Umbrales por producto y sede (mínimo y crítico). El catálogo es de empresa; las alertas solo
            aplica al almacén seleccionado arriba.
          </p>
        </div>
      ) : null}

      <div className="inv-semaphore__filters" role="tablist" aria-label="Filtrar por estado">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "attention"}
          className={`inv-semaphore__tab${filter === "attention" ? " is-active" : ""}`}
          onClick={() => setFilter("attention")}
        >
          Requieren atención
          {attentionTotal > 0 ? <span className="inv-semaphore__tab-badge">{attentionTotal}</span> : null}
        </button>
        {(["critical", "low", "out", "ok"] as const).map((sig) => (
          <button
            key={sig}
            type="button"
            role="tab"
            aria-selected={filter === sig}
            className={`inv-semaphore__tab inv-semaphore__tab--${sig}${filter === sig ? " is-active" : ""}`}
            onClick={() => setFilter(sig)}
          >
            {FILTERS.find((f) => f.key === sig)?.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="inv-grid inv-grid--loading" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="inv-card inv-card--skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="inv-empty">
          <p>
            {filter === "ok"
              ? "Ningún producto en verde en esta sede con el filtro actual."
              : "Nada que mostrar para este estado en la sede seleccionada."}
          </p>
          {filter !== "ok" ? (
            <Link to="/app/inventario/entrada" className="inv-btn inv-btn--primary">
              Registrar entrada
            </Link>
          ) : (
            <Link to="/app/inventario" className="inv-btn inv-btn--ghost">
              Ver catálogo
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="inv-page__desc">
            {total} producto{total !== 1 ? "s" : ""} · {activeFilter.label}
          </p>
          <div className="inv-grid">
            {items.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                showStock
                showSemaphoreTag
                linkBase="/app/inventario"
                returnTo={returnTo}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
