import { useCallback, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Barcode, Pencil, Trash2 } from "lucide-react";
import {
  deleteProduct,
  deleteProductImage,
  fetchProductMaster,
  uploadProductImages,
} from "../../api/inventory.js";
import { ImageDropzone, type PendingFile } from "../../components/inventory/ImageDropzone.js";
import { Modal } from "../../components/ui/Modal.js";

import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { resolveProductImage } from "../../lib/mediaUrl.js";
import type { ProductDetail } from "../inventory/inventory.types.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function DetailBarcodeCanvas({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    try {
      JsBarcode(canvasRef.current, value, {
        format: "CODE128",
        width: 1.8,
        height: 44,
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
      /* ignore */
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

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const showCost = user?.roles.includes("super_admin") ?? false;
  const canEdit = user?.roles.some((r) =>
    ["super_admin", "secretaria", "admin_local"].includes(r)
  );

  const [item, setItem] = useState<ProductDetail | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [deleteProductError, setDeleteProductError] = useState<string | null>(null);



  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProductMaster(token, id);
      setItem(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUploadPending() {
    if (!token || !id || pendingImages.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await uploadProductImages(
        token,
        id,
        pendingImages.map((p) => p.file)
      );
      for (const p of pendingImages) URL.revokeObjectURL(p.preview);
      setPendingImages([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteImage(imageId: string) {
    if (!token || !id) return;
    if (!window.confirm("¿Eliminar esta imagen?")) return;
    setError(null);
    try {
      await deleteProductImage(token, id, imageId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
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

  if (loading) {
    return <p className="inv-page__desc">Cargando producto…</p>;
  }
  if (error && !item) {
    return (
      <div className="inv-page">
        <p className="form-error">{error}</p>
        <Link to="/app/productos" className="inv-back">
          Volver a productos
        </Link>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="inv-page">
        <p className="form-error">Producto no encontrado</p>
        <Link to="/app/productos" className="inv-back">
          Volver a productos
        </Link>
      </div>
    );
  }

  const primaryImage = item.images.find((im) => im.isPrimary) ?? item.images[0];
  const heroSrc = resolveProductImage({
    url: primaryImage?.url ?? item.imageUrl,
    thumbUrl: primaryImage?.thumbUrl,
    variants: primaryImage?.variants,
    prefer: "lg",
  });

  return (
    <div className="inv-page inv-page--detail">
      <ProductPageHeader
        backTo="/app/productos"
        title={item.name}
        description="Ficha de catálogo · toda la empresa"
        actions={
          <>
            {canEdit ? (
              <>
                <Link to={`/app/productos/${id}/editar`} className="inv-btn inv-btn--primary">
                  <Pencil size={18} strokeWidth={2} aria-hidden />
                  Editar
                </Link>
                <button
                  type="button"
                  className="inv-btn inv-btn--danger"
                  onClick={() => setShowDeleteModal(true)}
                >
                  <Trash2 size={18} strokeWidth={2} aria-hidden />
                  Eliminar
                </button>
              </>
            ) : null}
            <Link to={`/app/inventario/producto/${id}`} className="inv-btn inv-btn--ghost">
              Ver stock por sede
            </Link>
          </>
        }
      />

      {error ? <p className="form-error" role="alert">{error}</p> : null}



      <div className="inv-detail">
        <div className="inv-detail__media">
          {heroSrc ? (
            <img src={heroSrc} alt={item.name} />
          ) : (
            <div className="inv-detail__placeholder">Sin imagen</div>
          )}
          {item.images.length > 1 ? (
            <div className="inv-detail__thumbs">
              {item.images.map((im) => {
                const src = resolveProductImage({
                  url: im.url,
                  thumbUrl: im.thumbUrl,
                  variants: im.variants,
                  prefer: "sm",
                });
                return src ? (
                  <img key={im.id} src={src} alt="" className={im.isPrimary ? "is-primary" : ""} />
                ) : null;
              })}
            </div>
          ) : null}
        </div>
        <div className="inv-detail__info">
          <h1>{item.name}</h1>
          <p className="inv-detail__price">{formatMoney(item.baseSalePrice)}</p>
          {showCost && item.productionCost != null ? (
            <p className="inv-detail__cost">
              Costo {formatMoney(item.productionCost)}
              {item.marginPercent != null ? ` · Margen ${item.marginPercent}%` : ""}
            </p>
          ) : null}
          <dl className="inv-detail__meta">
            <div>
              <dt>Referencia</dt>
              <dd>{item.referenceCode}</dd>
            </div>
            {item.sku ? (
              <div>
                <dt>SKU</dt>
                <dd>{item.sku}</dd>
              </div>
            ) : null}
            {item.barcode ? (
              <div className="inv-detail__barcode-block">
                <dt>Código de barras</dt>
                <dd className="inv-detail__barcode" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Barcode size={16} strokeWidth={2} aria-hidden />
                    {item.barcode}
                  </span>
                  <DetailBarcodeCanvas value={item.barcode} />
                </dd>
              </div>
            ) : null}
          </dl>

          {item.warehousePrices && item.warehousePrices.length > 0 ? (
            <div className="inv-detail__prices-card">
              <div className="inv-detail__prices-head">
                Precios de venta específicos por sede
              </div>
              <table className="inv-detail__prices-table">
                <thead>
                  <tr>
                    <th>Sede</th>
                    <th>Precio Especial</th>
                  </tr>
                </thead>
                <tbody>
                  {item.warehousePrices.map((wp) => (
                    <tr key={wp.warehouseId}>
                      <td>
                        <strong>{wp.warehouseName}</strong> <span>({wp.warehouseCode})</span>
                      </td>
                      <td className={wp.salePrice != null ? "is-custom" : "is-default"}>
                        {wp.salePrice != null ? formatMoney(wp.salePrice) : "Usa precio default"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {canEdit ? (
            <section className="inv-detail__gallery-edit">
              <h2>Galería</h2>
              {item.images.length > 0 ? (
                <ul className="inv-gallery">
                  {item.images.map((im) => {
                    const src = resolveProductImage({
                  url: im.url,
                  thumbUrl: im.thumbUrl,
                  variants: im.variants,
                  prefer: "sm",
                });
                    return (
                      <li key={im.id}>
                        {src ? <img src={src} alt="" /> : null}
                        <button
                          type="button"
                          className="inv-gallery__del"
                          aria-label="Eliminar imagen"
                          onClick={() => void onDeleteImage(im.id)}
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <ImageDropzone
                disabled={uploading}
                files={pendingImages}
                onFilesChange={setPendingImages}
                hint="Añade más fotos al catálogo"
              />
              {pendingImages.length > 0 ? (
                <button
                  type="button"
                  className="inv-btn inv-btn--primary"
                  disabled={uploading}
                  onClick={() => void onUploadPending()}
                >
                  {uploading ? "Subiendo…" : `Subir ${pendingImages.length} imagen(es)`}
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

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
            ¿Estás seguro de que deseas eliminar el producto <strong>{item.name}</strong>
            {item.referenceCode ? (
              <> (Ref: <code>{item.referenceCode}</code>)</>
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
