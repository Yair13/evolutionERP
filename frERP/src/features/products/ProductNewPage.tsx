import { type FormEvent, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Gauge } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  createProduct,
  uploadProductImages,
} from "../../api/inventory.js";
import { ImageDropzone, type PendingFile } from "../../components/inventory/ImageDropzone.js";
import { MoneyInput } from "../../components/ui/MoneyInput.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function normalizeEvolutionSuffix(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("EVOLUTION") && cleaned.length > 9) {
    return cleaned.slice(9);
  }
  return cleaned;
}

function LiveBarcodePreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    try {
      JsBarcode(canvasRef.current, value, {
        format: "CODE128",
        width: 1.8,
        height: 42,
        displayValue: true,
        font: "monospace",
        fontSize: 12,
        fontOptions: "bold",
        textMargin: 3,
        margin: 6,
        background: "#ffffff",
        lineColor: "#0f172a",
      });
    } catch {
      /* ignore invalid intermediate input */
    }
  }, [value]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        marginTop: "6px",
        borderRadius: "6px",
        border: "1px solid #e2e8f0",
        background: "#ffffff",
      }}
    />
  );
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
  const [baseSalePrice, setBaseSalePrice] = useState("");
  const [productionCost, setProductionCost] = useState("");
  const [warehousePrices, setWarehousePrices] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([]);

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

      const cleanSuffix = normalizeEvolutionSuffix(codeSuffix.trim());
      const fullCode = "EVOLUTION" + cleanSuffix;
      if (!cleanSuffix) {
        setError("Debes ingresar el sufijo del código después de EVOLUTION (letras y números o solo números, ej. S01, CTR012, 01).");
        setLoading(false);
        return;
      }
      const { item } = await createProduct(token, {
        name: name.trim(),
        referenceCode: fullCode,
        internalCode: fullCode,
        barcode: hasBarcode ? fullCode : null,
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
        const cleanSuffix = normalizeEvolutionSuffix(codeSuffix.trim());
        setError(`El código EVOLUTION${cleanSuffix} ya existe en el sistema. Cada producto debe tener un código único.`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const salePrice = Number(baseSalePrice);
  const previewImage = pendingImages[0]?.preview;
  const cleanPreviewSuffix = normalizeEvolutionSuffix(codeSuffix.trim());
  const fullPreviewCode = cleanPreviewSuffix ? `EVOLUTION${cleanPreviewSuffix}` : "";

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
                  ? "El código de barras será exactamente el mismo código del producto (ej. EVOLUTIONS01). En salida se escanea con la pistola."
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
                    <span>Código del producto (y código de barras) *</span>
                    <div className="inv-form__prefix-wrap">
                      <span className="inv-form__prefix-tag">
                        EVOLUTION
                      </span>
                      <input
                        value={codeSuffix}
                        onChange={(e) => setCodeSuffix(normalizeEvolutionSuffix(e.target.value))}
                        required
                        placeholder="Ej: S01, CTR012, 01"
                        className="inv-form__prefix-input"
                      />
                    </div>
                    <span className="inv-form__field-note">
                      Empieza por <strong>EVOLUTION</strong> seguido de letras y números o solo números (ej.{" "}
                      <code>EVOLUTIONS01</code>). Este mismo código será su código de barras.
                    </span>
                  </label>
                  <div className="field inv-form__full">
                    <span>¿Tiene código de barras? *</span>
                    <div
                      role="radiogroup"
                      aria-label="¿Tiene código de barras?"
                      className="inv-form__radio-group"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={hasBarcode}
                        className={`inv-btn ${hasBarcode ? "inv-btn--primary" : "inv-btn--ghost"}`}
                        onClick={() => setHasBarcode(true)}
                      >
                        Sí — se genera al guardar (solo pistola en salida)
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!hasBarcode}
                        className={`inv-btn ${!hasBarcode ? "inv-btn--primary" : "inv-btn--ghost"}`}
                        onClick={() => setHasBarcode(false)}
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
                  <dt>Código del producto</dt>
                  <dd>{fullPreviewCode || "EVOLUTION—"}</dd>
                </div>
                <div>
                  <dt>Código de barras</dt>
                  <dd>
                    {hasBarcode ? (
                      fullPreviewCode ? (
                        <div>
                          <span>{fullPreviewCode}</span>
                          <LiveBarcodePreview value={fullPreviewCode} />
                        </div>
                      ) : (
                        "Igual al código (EVOLUTION…)"
                      )
                    ) : (
                      "Sin código"
                    )}
                  </dd>
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
