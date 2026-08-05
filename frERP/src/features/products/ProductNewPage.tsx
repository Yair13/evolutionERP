import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  createCategory,
  createProduct,
  fetchCategories,
  uploadProductImages,
} from "../../api/inventory.js";
import { ImageDropzone, type PendingFile } from "../../components/inventory/ImageDropzone.js";
import { MoneyInput } from "../../components/ui/MoneyInput.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import type { ProductCategory } from "../inventory/inventory.types.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ProductNewPage() {
  const { token, user } = useAuth();
  const { warehouses } = useWarehouse();
  const navigate = useNavigate();
  const showCost = user?.roles.includes("super_admin") ?? false;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [codeSuffix, setCodeSuffix] = useState("");
  const [hasBarcode, setHasBarcode] = useState(true);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [baseSalePrice, setBaseSalePrice] = useState("");
  const [productionCost, setProductionCost] = useState("");
  const [warehousePrices, setWarehousePrices] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([]);

  const loadCategories = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchCategories(token);
      setCategories(data.items);
    } catch {
      /* keep empty list */
    }
  }, [token]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function onAddCategory() {
    if (!token || !newCategoryName.trim()) return;
    setAddingCategory(true);
    setError(null);
    try {
      const { item } = await createCategory(token, newCategoryName.trim());
      setCategories((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setCategoryId(item.id);
      setNewCategoryName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la categoría");
    } finally {
      setAddingCategory(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const pricesPayload = Object.entries(warehousePrices)
        .map(([whId, val]) => ({
          warehouseId: whId,
          salePrice: val.trim() ? Number(val) : null,
        }))
        .filter((p) => p.salePrice !== null);

      const fullCode = "EVO-" + codeSuffix.trim();
      if (!codeSuffix.trim()) {
        setError("Debes ingresar el consecutivo del código (parte después de EVO-).");
        setLoading(false);
        return;
      }
      const { item } = await createProduct(token, {
        name: name.trim(),
        referenceCode: fullCode,
        internalCode: fullCode || null,
        categoryId: categoryId || null,
        unit: "und",
        baseSalePrice: Number(baseSalePrice) || 0,
        productionCost: showCost ? Number(productionCost) || 0 : undefined,
        warehousePrices: pricesPayload,
        hasBarcode,
      });
      if (pendingImages.length > 0) {
        await uploadProductImages(
          token,
          item.id,
          pendingImages.map((p) => p.file)
        );
        for (const p of pendingImages) URL.revokeObjectURL(p.preview);
      }
      navigate(`/app/productos/${item.id}`, {
        replace: true,
        state: hasBarcode ? { printLabel: true } : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg === "duplicate_code_or_barcode") {
        setError(`El código EVO-${codeSuffix.trim()} ya existe en el sistema. Cada producto debe tener un código único.`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const salePrice = Number(baseSalePrice);
  const previewImage = pendingImages[0]?.preview;

  return (
    <div className="inv-page">
      <ProductPageHeader
        backTo="/app/productos"
        title="Nuevo producto"
        description="Solo datos del catálogo. El stock se carga en Inventario (entradas por sede)."
      />

      <form className="inv-form inv-form--product-new" onSubmit={onSubmit}>
        <div className="inv-form__layout">
          <div className="inv-form__info-panel" role="note">
            <span className="inv-active-alert inv-active-alert--panel">
              <Gauge size={16} strokeWidth={2.5} aria-hidden />
              Información activa
            </span>
            <ul className="inv-form__info-list">
              <li>
                {hasBarcode
                  ? "Al guardar se genera un código de barras único. En salida solo se agrega con la pistola."
                  : "Sin código de barras: en salida se podrá buscar y agregar desde el listado."}
              </li>
              <li>
                El stock se registra después en <strong>Inventario → Entrada</strong> por sede.
              </li>
            </ul>
          </div>

          <div className="inv-form__columns">
            <div className="inv-form__main">
              <section className="inv-form__section">
                <h2>Datos del producto</h2>
                <div className="inv-form__grid">
                  <label className="field">
                    <span>Nombre *</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} required />
                  </label>
                  <label className="field">
                    <span>Código interno (consecutivo) *</span>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ background: "#f1f5f9", padding: "8px 12px", border: "1px solid #cbd5e1", borderRight: "none", borderRadius: "6px 0 0 6px", fontSize: "14px", fontWeight: "bold", color: "#475569" }}>
                        EVO-
                      </span>
                      <input
                        value={codeSuffix}
                        onChange={(e) => setCodeSuffix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                        required
                        placeholder="Ej: 001"
                        style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, flex: 1 }}
                      />
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
                      Este código es único por producto en todo el sistema. No se puede repetir.
                    </span>
                  </label>
                  <div className="inv-form__category inv-form__full">
                    <label className="field">
                      <span>Categoría</span>
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        aria-label="Categoría del producto"
                      >
                        <option value="">Sin categoría</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="inv-form__category-add">
                      <input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Nueva categoría"
                        aria-label="Nombre de nueva categoría"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void onAddCategory();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="inv-btn inv-btn--ghost"
                        disabled={addingCategory || !newCategoryName.trim()}
                        onClick={() => void onAddCategory()}
                      >
                        {addingCategory ? "…" : "Añadir"}
                      </button>
                    </div>
                  </div>
                  <div className="field inv-form__full">
                    <span>¿Tiene código de barras? *</span>
                    <div
                      role="radiogroup"
                      aria-label="¿Tiene código de barras?"
                      style={{ display: "flex", gap: "10px", marginTop: "6px" }}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={hasBarcode}
                        className={`inv-btn ${hasBarcode ? "inv-btn--primary" : "inv-btn--ghost"}`}
                        onClick={() => setHasBarcode(true)}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: "6px", fontSize: "13px" }}
                      >
                        Sí — se genera al guardar (solo pistola en salida)
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!hasBarcode}
                        className={`inv-btn ${!hasBarcode ? "inv-btn--primary" : "inv-btn--ghost"}`}
                        onClick={() => setHasBarcode(false)}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: "6px", fontSize: "13px" }}
                      >
                        No — buscable en el listado de salida
                      </button>
                    </div>
                  </div>
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
            </div>

            <aside className="inv-form__aside" aria-label="Imágenes y vista previa del catálogo">
            <section className="inv-form__section inv-form__section--media">
              <h2>Imágenes</h2>
              <ImageDropzone
                disabled={loading}
                files={pendingImages}
                onFilesChange={setPendingImages}
                label=""
                hint="Arrastra fotos o toca para elegir · JPG, PNG, WebP"
              />
            </section>

            <div className="inv-product-preview" aria-live="polite">
              <p className="inv-product-preview__eyebrow">Vista previa · catálogo</p>
              <div className="inv-product-preview__media">
                {previewImage ? (
                  <img src={previewImage} alt="" />
                ) : (
                  <div className="inv-product-preview__placeholder">Sin foto aún</div>
                )}
              </div>
              <h3 className="inv-product-preview__name">{name.trim() || "Nombre del producto"}</h3>
              <dl className="inv-product-preview__meta">
                <div>
                  <dt>Código interno</dt>
                  <dd>EVO-{codeSuffix.trim() || "—"}</dd>
                </div>
                <div>
                  <dt>Código de barras</dt>
                  <dd>{hasBarcode ? "Se generará al guardar" : "Sin código"}</dd>
                </div>
              </dl>
              {salePrice > 0 ? (
                <p className="inv-product-preview__price">{formatMoney(salePrice)}</p>
              ) : (
                <p className="inv-product-preview__price inv-product-preview__price--muted">Precio pendiente</p>
              )}
            </div>
            </aside>
          </div>

          <div className="inv-form__footer">
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="inv-form__actions">
              <Link to="/app/productos" className="inv-btn inv-btn--ghost">
                Cancelar
              </Link>
              <button type="submit" className="inv-btn inv-btn--primary" disabled={loading}>
                {loading ? "Guardando…" : "Crear producto"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
