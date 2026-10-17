import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
const BarcodeScannerModal = lazy(() =>
  import("../../components/inventory/BarcodeScannerModal.js").then((m) => ({ default: m.BarcodeScannerModal }))
);
import { useResolveScan } from "../../hooks/useResolveScan.js";
import { ArrowDownToLine, ArrowUpFromLine, Search, ScanLine } from "lucide-react";
import { fetchCatalog } from "../../api/inventory.js";
import { InvScopeBar } from "../../components/inventory/InvScopeBar.js";
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { ProductCard } from "../../components/inventory/ProductCard.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import type { CatalogItem } from "./inventory.types.js";

export function CatalogPage() {
  const { token } = useAuth();
  const { warehouseId, warehouses, isAllWarehouses } = useWarehouse();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const navigate = useNavigate();
  const resolveScan = useResolveScan(token, warehouseId);

  const sedeName = warehouses.find((w) => w.id === warehouseId)?.name;

  const load = useCallback(async () => {
    if (!token || !warehouseId) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchCatalog(token, warehouseId, { q: search || undefined, limit: 60 });
      setItems(catalog.items);
      setTotal(catalog.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, warehouseId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  const stats = useMemo(() => {
    const critical = items.filter((i) => i.stockSignal === "critical").length;
    const low = items.filter((i) => i.stockSignal === "low").length;
    const out = items.filter((i) => i.stockSignal === "out").length;
    return { critical, low, out };
  }, [items]);

  const emptyMessage = search
    ? "Ningún producto coincide con el filtro."
    : "Aún no hay productos en el catálogo de la empresa.";

  return (
    <div className="inv-page">
      <InventoryPageHeader
        title="Inventario"
        description={
          isAllWarehouses
            ? "Sesión en todas las sedes · elige una sede arriba para ver existencias, o ve a Productos para el catálogo general"
            : sedeName
              ? `Existencias en ${sedeName} · ${total} productos con referencia en catálogo`
              : "Elige una sede para ver stock y alertas"
        }
        scope={<InvScopeBar focus="stock" allowAllWarehouses />}
        actions={
          <>
            <Link to="/app/inventario/entrada" className="inv-btn inv-btn--ghost">
              <ArrowDownToLine size={18} strokeWidth={2} aria-hidden />
              Entrada
            </Link>
            <Link to="/app/inventario/salida" className="inv-btn inv-btn--ghost">
              <ArrowUpFromLine size={18} strokeWidth={2} aria-hidden />
              Salida
            </Link>
            <Link to="/app/inventario/semaforo" className="inv-btn inv-btn--ghost">
              Alertas de stock
            </Link>
          </>
        }
        toolbar={
          <div className="inv-toolbar">
            <div className="inv-search">
              <Search size={18} strokeWidth={2} className="inv-search__icon" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nombre, SKU o código de barras…"
                aria-label="Buscar productos"
                autoComplete="off"
              />
              <button
                type="button"
                className="inv-search__scan"
                title="Escanear con cámara"
                onClick={() => setScannerOpen(true)}
              >
                <ScanLine size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        }
        alerts={
          (stats.critical > 0 || stats.low > 0 || stats.out > 0) && !loading ? (
            <div className="inv-alerts" role="status">
              {stats.critical > 0 ? (
                <Link to="/app/inventario/semaforo?estado=critical" className="inv-alert inv-alert--critical">
                  {stats.critical} crítico en esta sede
                </Link>
              ) : null}
              {stats.out > 0 ? (
                <Link to="/app/inventario/semaforo?estado=out" className="inv-alert inv-alert--out">
                  {stats.out} sin stock en esta sede
                </Link>
              ) : null}
              {stats.low > 0 ? (
                <Link to="/app/inventario/semaforo?estado=low" className="inv-alert inv-alert--low">
                  {stats.low} stock bajo en esta sede
                </Link>
              ) : null}
              <Link to="/app/inventario/semaforo" className="inv-alert inv-alert--link">
                Ver alertas de stock
              </Link>
            </div>
          ) : null
        }
      />

      {scannerOpen ? (
        <Suspense fallback={null}>
          <BarcodeScannerModal
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onDetected={(code) => {
              void resolveScan(code)
                .then((item) => navigate(`/app/inventario/producto/${item.id}`))
                .catch((err) => setError(err instanceof Error ? err.message : "No encontrado"));
            }}
          />
        </Suspense>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="inv-grid inv-grid--loading" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="inv-card inv-card--skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="inv-empty">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="inv-grid">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              showStock
              showSemaphoreTag
              linkBase="/app/inventario"
            />
          ))}
        </div>
      )}
    </div>
  );
}
