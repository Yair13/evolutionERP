import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchProductMaster,
  updateProductMaster,
  uploadProductImages,
} from "../../api/inventory.js";
import { ImageDropzone, type PendingFile } from "../../components/inventory/ImageDropzone.js";
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

        <div className="inv-form__actions">
          <Link to={id ? `/app/productos/${id}` : "/app/productos"} className="inv-btn inv-btn--ghost">
            Cancelar
          </Link>
          <button type="submit" className="inv-btn inv-btn--primary" disabled={loading}>
            {loading ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
