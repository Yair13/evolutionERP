import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import {
  deleteProduct,
  fetchProductMaster,
  updateProductMaster,
  uploadProductImages,
} from "../../api/inventory.js";
import { ImageDropzone, type PendingFile } from "../../components/inventory/ImageDropzone.js";
import { Modal } from "../../components/ui/Modal.js";
import { MoneyInput } from "../../components/ui/MoneyInput.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { warehouses } = useWarehouse();
  const navigate = useNavigate();
  const showCost = user?.roles.includes("super_admin") ?? false;
  const canEdit = user?.roles.some((r) =>
    ["super_admin", "secretaria", "admin_local"].includes(r)
  );

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(true);

  const [name, setName] = useState("");
  const [internalCode, setInternalCode] = useState("");
  const [baseSalePrice, setBaseSalePrice] = useState("");
  const [productionCost, setProductionCost] = useState("");
  const [warehousePrices, setWarehousePrices] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [deleteProductError, setDeleteProductError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoadingProduct(true);
    setError(null);
    try {
      const prod = await fetchProductMaster(token, id);
      const item = prod.item;
      setName(item.name);
      setInternalCode(item.internalCode ?? "");
      setBaseSalePrice(String(item.baseSalePrice));
      setProductionCost(item.productionCost != null ? String(item.productionCost) : "");

      const savedPrices: Record<string, string> = {};
      if (item.warehousePrices) {
        for (const wp of item.warehousePrices) {
          if (wp.salePrice != null) {
            savedPrices[wp.warehouseId] = String(wp.salePrice);
          }
        }
      }
      setWarehousePrices(savedPrices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoadingProduct(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    setError(null);
    setLoading(true);
    try {
      const pricesPayload = Object.entries(warehousePrices)
        .map(([whId, val]) => ({
          warehouseId: whId,
          salePrice: val.trim() ? Number(val) : null,
        }))
        .filter((p) => p.salePrice !== null);

      await updateProductMaster(token, id, {
        name: name.trim(),
        referenceCode: internalCode.trim(),
        internalCode: internalCode.trim() || null,
        unit: "und",
        baseSalePrice: Number(baseSalePrice) || 0,
        productionCost: showCost ? Number(productionCost) || 0 : undefined,
        warehousePrices: pricesPayload,
      });
      if (pendingImages.length > 0) {
        await uploadProductImages(
          token,
          id,
          pendingImages.map((p) => p.file)
        );
        for (const p of pendingImages) URL.revokeObjectURL(p.preview);
      }
      navigate(`/app/productos/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!token || !id) return;
    setDeletingProduct(true);
    setDeleteProductError(null);
    try {
      await deleteProduct(token, id);
      navigate("/app/productos", { replace: true });
    } catch (err) {
      setDeleteProductError(err instanceof Error ? err.message : "Error al eliminar producto");
    } finally {
      setDeletingProduct(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="inv-page">
        <p className="form-error">No tienes permiso para editar productos.</p>
        <Link to={id ? `/app/productos/${id}` : "/app/productos"} className="inv-back">
          Volver
        </Link>
      </div>
    );
  }

  if (loadingProduct) {
    return <p className="inv-page__desc">Cargando producto…</p>;
  }

  return (
    <div className="inv-page">
      <ProductPageHeader
        backTo={id ? `/app/productos/${id}` : "/app/productos"}
        backLabel="Ficha"
        title="Editar producto"
        description="Cambios en el catálogo de toda la empresa"
      />

      <form className="inv-form inv-form--product-new" onSubmit={onSubmit}>
        <section className="inv-form__section">
          <h2>Datos del producto</h2>
          <div className="inv-form__grid">
            <label className="field">
              <span>Nombre *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Código del producto *</span>
              <input value={internalCode} disabled style={{ background: "#f1f5f9", cursor: "not-allowed", color: "#64748b" }} />
            </label>
          </div>
        </section>

        <section className="inv-form__section">
          <h2>Precios</h2>
          <div className="inv-form__grid">
            <label className="field">
              <span>Precio de venta default (todas las sedes) *</span>
              <MoneyInput
                value={baseSalePrice}
                onChange={setBaseSalePrice}
                placeholder="$0"
                required
              />
            </label>
            {showCost ? (
              <label className="field">
                <span>Costo interno de producción</span>
                <MoneyInput
                  value={productionCost}
                  onChange={setProductionCost}
                  placeholder="$0"
                />
              </label>
            ) : null}
          </div>
        </section>

        <section className="inv-form__section">
          <h2>Precios específicos por sede (Opcional)</h2>
          <div className="inv-form__grid">
            {warehouses.map((wh) => (
              <label key={wh.id} className="field">
                <span>{wh.name} ({wh.code})</span>
                <MoneyInput
                  value={warehousePrices[wh.id] ?? ""}
                  onChange={(val) => setWarehousePrices(prev => ({ ...prev, [wh.id]: val }))}
                  placeholder="Usar precio default"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="inv-form__section">
          <h2>Añadir imágenes</h2>
          <ImageDropzone
            disabled={loading}
            files={pendingImages}
            onFilesChange={setPendingImages}
            hint="Las nuevas fotos se suman a la galería del producto"
          />
        </section>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className="inv-form__actions"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}
        >
          <button
            type="button"
            className="inv-btn inv-btn--danger"
            onClick={() => setShowDeleteModal(true)}
            disabled={loading || loadingProduct}
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden />
            Eliminar producto
          </button>
          <div style={{ display: "flex", gap: "10px" }}>
            <Link to={id ? `/app/productos/${id}` : "/app/productos"} className="inv-btn inv-btn--ghost">
              Cancelar
            </Link>
            <button type="submit" className="inv-btn inv-btn--primary" disabled={loading}>
              {loading ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </form>

      <Modal
        open={showDeleteModal}
        title="Eliminar producto"
        onClose={() => {
          if (!deletingProduct) {
            setShowDeleteModal(false);
            setDeleteProductError(null);
          }
        }}
      >
        <div>
          <p style={{ margin: "0 0 12px", color: "var(--text)", fontSize: "14px", lineHeight: "1.5" }}>
            ¿Estás seguro de que deseas eliminar este producto (<strong>{name || "Sin nombre"}</strong>
            {internalCode ? (
              <> · Ref: <code>{internalCode}</code></>
            ) : null}
            )?
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
                eliminará completamente de la base de datos.
              </li>
              <li>
                Si el producto <strong>ya tiene ventas, entradas o documentos</strong> asociados, se
                desactivará y ocultará del catálogo para salvaguardar el historial contable.
              </li>
            </ul>
          </div>

          {deleteProductError ? (
            <p className="form-error" role="alert" style={{ marginBottom: "14px" }}>
              {deleteProductError}
            </p>
          ) : null}

          <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              disabled={deletingProduct}
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteProductError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="inv-btn inv-btn--danger"
              disabled={deletingProduct}
              onClick={handleConfirmDelete}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {deletingProduct ? "Eliminando…" : "Sí, eliminar producto"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
