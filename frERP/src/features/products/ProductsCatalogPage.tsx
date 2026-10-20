import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, PackagePlus, Search, Trash2 } from "lucide-react";
import { deleteProduct, fetchProductCatalog } from "../../api/inventory.js";
import { ProductCard } from "../../components/inventory/ProductCard.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { Modal } from "../../components/ui/Modal.js";
import { useAuth } from "../../context/AuthContext.js";
import type { CatalogItem } from "../inventory/inventory.types.js";

export function ProductsCatalogPage() {
  const { token, user } = useAuth();
  const canManage =
    user?.roles.some((r) => ["super_admin", "secretaria", "admin_local"].includes(r)) ?? false;

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [productToDelete, setProductToDelete] = useState<CatalogItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "info" } | null>(
    null
  );

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

  async function handleConfirmDelete() {
    if (!token || !productToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteProduct(token, productToDelete.id);
      setItems((prev) => prev.filter((it) => it.id !== productToDelete.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setFeedback({
        message:
          res.message ||
          (res.action === "deleted"
            ? `Producto "${productToDelete.name}" eliminado definitivamente.`
            : `Producto "${productToDelete.name}" retirado y desactivado del catálogo.`),
        type: res.action === "deleted" ? "success" : "info",
      });
      setProductToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error al eliminar el producto");
    } finally {
      setDeleting(false);
    }
  }

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

      {feedback ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "10px",
            background: feedback.type === "success" ? "#ecfdf5" : "#eff6ff",
            border: `1px solid ${feedback.type === "success" ? "#a7f3d0" : "#bfdbfe"}`,
            color: feedback.type === "success" ? "#065f46" : "#1e40af",
            fontSize: "14px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {feedback.type === "success" ? (
              <CheckCircle2 size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            ) : (
              <AlertCircle size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
              color: "inherit",
              padding: "2px 6px",
            }}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        </div>
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
          <p>No hay productos registrados.</p>
          <Link to="/app/productos/nuevo" className="inv-btn inv-btn--primary">
            Crear producto
          </Link>
        </div>
      ) : (
        <div className="inv-grid">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              linkBase="/app/productos"
              onDelete={
                canManage
                  ? (it) => {
                      setDeleteError(null);
                      setProductToDelete(it);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(productToDelete)}
        title="Eliminar producto"
        onClose={() => {
          if (!deleting) {
            setProductToDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <div>
          <p style={{ margin: "0 0 12px", color: "var(--text)", fontSize: "14px", lineHeight: "1.5" }}>
            ¿Estás seguro de que deseas eliminar el producto{" "}
            <strong>{productToDelete?.name}</strong>
            {productToDelete?.referenceCode ? (
              <> (Ref: <code>{productToDelete.referenceCode}</code>)</>
            ) : null}
            ?
          </p>

          <div
            style={{
              padding: "12px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              fontSize: "13px",
              color: "#991b1b",
              lineHeight: "1.5",
              marginBottom: "16px",
            }}
          >
            <strong>Información importante:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
              <li>
                Si el producto <strong>no tiene movimientos</strong> ni documentos registrados, se
                eliminará completamente del sistema.
              </li>
              <li>
                Si el producto <strong>ya tiene ventas, entradas o documentos</strong> asociados, se
                desactivará y ocultará del catálogo para salvaguardar el historial contable.
              </li>
            </ul>
          </div>

          {deleteError ? (
            <p className="form-error" role="alert" style={{ marginBottom: "14px" }}>
              {deleteError}
            </p>
          ) : null}

          <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              disabled={deleting}
              onClick={() => {
                setProductToDelete(null);
                setDeleteError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="inv-btn inv-btn--danger"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {deleting ? "Eliminando…" : "Sí, eliminar producto"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
