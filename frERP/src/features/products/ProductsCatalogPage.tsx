import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PackagePlus, Search } from "lucide-react";
import { fetchProductCatalog } from "../../api/inventory.js";
import { ProductCard } from "../../components/inventory/ProductCard.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import type { CatalogItem } from "../inventory/inventory.types.js";

export function ProductsCatalogPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchProductCatalog(token, { q: search || undefined, limit: 60 });
      setItems(catalog.items);
      setTotal(catalog.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="inv-page">
      <ProductPageHeader
        title="Productos"
        description={`Catálogo de toda la empresa · ${total} productos · sin stock por sede`}
        actions={
          <div className="inv-page__actions-group">
            <Link to="/app/productos/cargue-masivo" className="inv-btn inv-btn--ghost">
              Cargue masivo
            </Link>
            <Link to="/app/productos/nuevo" className="inv-btn inv-btn--primary">
              <PackagePlus size={18} strokeWidth={2} aria-hidden />
              Nuevo producto
            </Link>
          </div>
        }
        toolbar={
          <div className="inv-toolbar">
            <div className="inv-search">
              <Search size={18} strokeWidth={2} className="inv-search__icon" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nombre, SKU o código…"
                aria-label="Buscar productos"
                autoComplete="off"
              />
            </div>
          </div>
        }
      />

      <p className="inv-page__desc">
        Para cantidades y alertas de stock por almacén usa{" "}
        <Link to="/app/inventario">Inventario</Link>.
      </p>

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
          <p>No hay productos registrados.</p>
          <Link to="/app/productos/nuevo" className="inv-btn inv-btn--primary">
            Crear producto
          </Link>
        </div>
      ) : (
        <div className="inv-grid">
          {items.map((item) => (
            <ProductCard key={item.id} item={item} linkBase="/app/productos" />
          ))}
        </div>
      )}
    </div>
  );
}
