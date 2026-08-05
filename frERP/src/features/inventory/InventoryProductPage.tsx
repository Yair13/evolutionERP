import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Barcode } from "lucide-react";
import { fetchProduct, updateProduct } from "../../api/inventory.js";
import { InvScopeBar } from "../../components/inventory/InvScopeBar.js";
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { StockBadge } from "../../components/inventory/StockBadge.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { resolveProductImage } from "../../lib/mediaUrl.js";
import type { ProductDetail } from "./inventory.types.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function resolveBack(from: string | undefined): { to: string; label: string } {
  if (from?.startsWith("/app/inventario/semaforo")) {
    return { to: from, label: "Alertas de stock" };
  }
  return { to: "/app/inventario", label: "Inventario" };
}

export function InventoryProductPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const back = resolveBack((location.state as { from?: string } | null)?.from);
  const { token, user } = useAuth();
  const { warehouseId, warehouses, isAllWarehouses } = useWarehouse();
  const sedeName = warehouses.find((w) => w.id === warehouseId)?.name;
  const canEdit = user?.roles.some((r) =>
    ["super_admin", "secretaria", "admin_local"].includes(r)
  );

  const [item, setItem] = useState<ProductDetail | null>(null);
  const [minStock, setMinStock] = useState("");
  const [criticalStock, setCriticalStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !warehouseId || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProduct(token, warehouseId, id);
      setItem(data.item);
      setMinStock(String(data.item.minStockLevel ?? 0));
      setCriticalStock(String(data.item.criticalStockLevel ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, warehouseId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveThresholds(e: FormEvent) {
    e.preventDefault();
    if (!token || !warehouseId || !id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const min = Math.max(0, Number(minStock) || 0);
    const critical = Math.max(0, Number(criticalStock) || 0);
    try {
      await updateProduct(
        token,
        id,
        {
          minStockLevel: min,
          criticalStockLevel: critical,
        },
        warehouseId
      );
      setSuccess("Umbrales guardados para esta sede.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="inv-page__desc">Cargando existencias…</p>;
  }
  if (error && !item) {
    return (
      <div className="inv-page">
        <p className="form-error">{error}</p>
        <Link to={back.to} className="inv-back">
          Volver a {back.label.toLowerCase()}
        </Link>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="inv-page">
        <p className="form-error">Producto no encontrado</p>
        <Link to={back.to} className="inv-back">
          Volver a {back.label.toLowerCase()}
        </Link>
      </div>
    );
  }

  const heroSrc = resolveProductImage({ url: item.imageUrl, prefer: "lg" });

  return (
    <div className="inv-page inv-page--detail">
      <InventoryPageHeader
        backTo={back.to}
        backLabel={back.label}
        title={item.name}
        description={
          isAllWarehouses
            ? "Sesión en todas las sedes · elige una sede para existencias y alertas"
            : sedeName
              ? `Existencias y alertas de stock en ${sedeName}`
              : "Elige sede para ver cantidades y alertas de stock"
        }
        scope={<InvScopeBar focus="stock" allowAllWarehouses requireSingleWarehouse />}
        actions={
          <>
            <Link to={`/app/productos/${id}`} className="inv-btn inv-btn--ghost">
              Ficha de producto
            </Link>
            <Link to="/app/inventario/entrada" className="inv-btn inv-btn--primary">
              Entrada
            </Link>
            <Link to="/app/inventario/salida" className="inv-btn inv-btn--ghost">
              Salida
            </Link>
          </>
        }
      />

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="inv-success" role="status">{success}</p> : null}

      <div className="inv-detail inv-detail--stock">
        {heroSrc ? (
          <img src={heroSrc} alt="" className="inv-detail__thumb-side" />
        ) : null}
        <div className="inv-detail__info">
          <p className="inv-detail__cat">{item.referenceCode}</p>
          <StockBadge signal={item.stockSignal} quantity={item.quantityOnHand} />
          <p className="inv-detail__price">{formatMoney(item.baseSalePrice)}</p>
          {item.barcode ? (
            <p className="inv-detail__barcode">
              <Barcode size={16} strokeWidth={2} aria-hidden />
              {item.barcode}
            </p>
          ) : null}
          <Link to="/app/inventario/semaforo" className="inv-btn inv-btn--ghost">
            Ver alertas de stock
          </Link>
        </div>
      </div>

      <section className="inv-form__section inv-semaphore-config">
        <h2>Alertas de stock en esta sede</h2>
        <p className="inv-form__hint">
          Los umbrales son <strong>por producto y por almacén</strong>. La cantidad actual viene de entradas y
          salidas; el color se calcula así:
        </p>
        <ul className="inv-semaphore-config__rules">
          <li>
            <span className="inv-stock inv-stock--ok">
              <span className="inv-stock__dot" aria-hidden />
              En stock
            </span>{" "}
            — cantidad mayor al mínimo
          </li>
          <li>
            <span className="inv-stock inv-stock--low">
              <span className="inv-stock__dot" aria-hidden />
              Stock bajo
            </span>{" "}
            — cantidad ≤ mínimo (y &gt; crítico)
          </li>
          <li>
            <span className="inv-stock inv-stock--critical">
              <span className="inv-stock__dot" aria-hidden />
              Crítico
            </span>{" "}
            — cantidad ≤ crítico (si crítico &gt; 0)
          </li>
          <li>
            <span className="inv-stock inv-stock--out">
              <span className="inv-stock__dot" aria-hidden />
              Sin stock
            </span>{" "}
            — cantidad en cero
          </li>
        </ul>

        {canEdit ? (
          <form className="inv-form__grid inv-semaphore-config__form" onSubmit={onSaveThresholds}>
            <label className="field">
              <span>Stock mínimo (amarillo)</span>
              <input
                type="number"
                min={0}
                step="1"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                disabled={!warehouseId || saving}
              />
            </label>
            <label className="field">
              <span>Stock crítico (naranja)</span>
              <input
                type="number"
                min={0}
                step="1"
                value={criticalStock}
                onChange={(e) => setCriticalStock(e.target.value)}
                disabled={!warehouseId || saving}
              />
            </label>
            <div className="inv-form__full">
              <button
                type="submit"
                className="inv-btn inv-btn--primary"
                disabled={!warehouseId || saving}
              >
                {saving ? "Guardando…" : "Guardar umbrales"}
              </button>
            </div>
          </form>
        ) : (
          <p className="inv-form__hint">
            Mínimo: <strong>{item.minStockLevel}</strong> · Crítico:{" "}
            <strong>{item.criticalStockLevel ?? 0}</strong>
          </p>
        )}
      </section>
    </div>
  );
}
