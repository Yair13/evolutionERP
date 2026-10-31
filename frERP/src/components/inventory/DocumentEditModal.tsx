import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Save, Search, X } from "lucide-react";
import { fetchCatalog } from "../../api/inventory.js";
import { cartHasInvalidSalePrices, clampUnitSalePrice, isUnitSalePriceValid } from "../../lib/salePrice.js";
import { VisualCart } from "./VisualCart.js";
import { EXIT_KIND_OPTIONS } from "../../features/inventory/exit-labels.js";
import type {
  CartLine,
  CatalogItem,
  ExitKind,
  InventoryDocumentDetail,
  MovementKind,
} from "../../features/inventory/inventory.types.js";

const ERROR_LABELS: Record<string, string> = {
  lines_required: "Agrega al menos un producto con cantidad.",
  insufficient_stock: "Stock insuficiente para una o más líneas.",
  document_not_found: "Documento no encontrado.",
  document_not_today: "Solo se pueden editar movimientos del día de hoy.",
  movement_edit_forbidden: "No tienes permiso para editar movimientos.",
  editing_not_unlocked: "Primero activa la edición en la tarjeta del movimiento.",
  invalid_movement_kind: "Tipo de movimiento no válido.",
  customer_name_required: "Venta: indica el nombre del cliente.",
  related_invoice_required: "Garantía: indica el número de factura original.",
  sale_price_below_suggested: "El valor de salida no puede ser menor al precio sugerido del catálogo.",
};

type EditPayload = {
  movementKind: MovementKind;
  lines: { productId: string; quantity: number; unitSalePrice?: number }[];
  notes?: string | null;
  customerName?: string | null;
  relatedInvoiceNumber?: string | null;
};

type Props = {
  document: InventoryDocumentDetail;
  warehouseId: string;
  token: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: EditPayload) => void;
};

function initialMovementKind(doc: InventoryDocumentDetail): MovementKind {
  if (doc.docType === "entry") return "entry";
  if (doc.exitKind && EXIT_KIND_OPTIONS.some((o) => o.value === doc.exitKind)) {
    return doc.exitKind;
  }
  return "sale";
}

function linesToCart(doc: InventoryDocumentDetail): CartLine[] {
  return doc.lines.map((l) => {
    const unit = l.unitSalePrice ?? 0;
    return {
      productId: l.productId,
      name: l.productName,
      referenceCode: l.referenceCode,
      imageUrl: l.imageUrl,
      suggestedSalePrice: unit,
      unitSalePrice: unit,
      quantityOnHand: 999999,
      quantity: l.quantity,
    };
  });
}

export function DocumentEditModal({
  document: doc,
  warehouseId,
  token,
  saving,
  error,
  onClose,
  onSave,
}: Props) {
  const [movementKind, setMovementKind] = useState<MovementKind>(() => initialMovementKind(doc));
  const [cart, setCart] = useState<CartLine[]>(() => linesToCart(doc));
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [customerName, setCustomerName] = useState(doc.customerName ?? "");
  const [relatedInvoiceNumber, setRelatedInvoiceNumber] = useState(doc.relatedInvoiceNumber ?? "");
  const [search, setSearch] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isEntry = movementKind === "entry";
  const isExit = !isEntry;
  const exitKind = isExit ? (movementKind as ExitKind) : null;
  const cartMode = isEntry || exitKind === "return" ? "entry" : "exit";

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQ(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadCatalog = useCallback(async () => {
    if (!token || !warehouseId) return;
    setCatalogLoading(true);
    try {
      const data = await fetchCatalog(token, warehouseId, {
        q: searchQ || undefined,
        limit: 30,
      });
      setCatalog(data.items);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [token, warehouseId, searchQ]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!token || !warehouseId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCatalog(token, warehouseId, { limit: 200 });
        if (cancelled) return;
        const origQty = new Map(doc.lines.map((l) => [l.productId, l.quantity]));
        const outbound = movementKind !== "entry" && movementKind !== "return";
        setCart((prev) =>
          prev.map((line) => {
            const item = data.items.find((i) => i.id === line.productId);
            const onHand = item?.quantityOnHand ?? line.quantityOnHand;
            const freed = outbound ? (origQty.get(line.productId) ?? 0) : 0;
            const suggested = item?.baseSalePrice ?? line.suggestedSalePrice;
            return {
              ...line,
              quantityOnHand: onHand + freed,
              suggestedSalePrice: suggested,
              unitSalePrice: clampUnitSalePrice(line.unitSalePrice, suggested),
            };
          })
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, warehouseId, movementKind, doc.lines]);

  const cartProductIds = useMemo(() => new Set(cart.map((l) => l.productId)), [cart]);

  function addProduct(item: CatalogItem) {
    const origQty = doc.lines.find((l) => l.productId === item.id)?.quantity ?? 0;
    const outbound = movementKind !== "entry" && movementKind !== "return";
    const maxAvail = outbound ? item.quantityOnHand + origQty : item.quantityOnHand;

    setCart((prev) => {
      const existing = prev.find((l) => l.productId === item.id);
      if (existing) {
        const updated: CartLine = {
          ...existing,
          quantity: Math.min(existing.quantity + 1, maxAvail || existing.quantity + 1),
          quantityOnHand: maxAvail,
        };
        return [updated, ...prev.filter((l) => l.productId !== item.id)];
      }
      return [
        {
          productId: item.id,
          name: item.name,
          referenceCode: item.referenceCode,
          imageUrl: item.imageUrl,
          suggestedSalePrice: item.baseSalePrice,
          unitSalePrice: item.baseSalePrice,
          quantityOnHand: maxAvail,
          quantity: 1,
        },
        ...prev,
      ];
    });
  }

  function onQtyChange(productId: string, quantity: number) {
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, quantity) } : l))
    );
  }

  function onRemove(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function onUnitSalePriceChange(productId: string, unitSalePrice: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, unitSalePrice: Math.round(unitSalePrice) } : l
      )
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (cartMode === "exit" && cartHasInvalidSalePrices(cart)) {
      const bad = cart.find((l) => !isUnitSalePriceValid(l.unitSalePrice, l.suggestedSalePrice));
      setLocalError(
        bad
          ? `El valor por unidad de «${bad.name}» no puede ser menor al sugerido. Revisa el carrito.`
          : "Corrige los valores por unidad antes de guardar."
      );
      return;
    }
    setLocalError(null);
    const includeSalePrice = cartMode === "exit";
    onSave({
      movementKind,
      lines: cart.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        ...(includeSalePrice ? { unitSalePrice: l.unitSalePrice } : {}),
      })),
      notes: notes.trim() || null,
      customerName: isExit ? customerName.trim() || null : null,
      relatedInvoiceNumber: exitKind === "warranty" ? relatedInvoiceNumber.trim() || null : null,
    });
  }

  const displayError = localError
    ? localError
    : error
      ? ERROR_LABELS[error] ?? (error.startsWith("insufficient") ? ERROR_LABELS.insufficient_stock : error)
      : null;

  return (
    <div className="inv-modal-backdrop" role="presentation">
      <form
        className="inv-modal inv-modal--edit-doc inv-modal--edit-doc-full"
        role="dialog"
        aria-labelledby="edit-doc-title"
        onSubmit={submit}
      >
        <h2 id="edit-doc-title">Editar movimiento</h2>
        <p className="inv-modal__hint">
          Se revierte el inventario del comprobante anterior y se aplica lo que guardes aquí (tipo, productos y
          cantidades).
        </p>

        <fieldset className="inv-edit-doc-fieldset">
          <legend>Tipo de movimiento</legend>
          <div className="inv-edit-doc-kind-grid">
            <label className="inv-edit-doc-kind">
              <input
                type="radio"
                name="movementKind"
                checked={movementKind === "entry"}
                onChange={() => setMovementKind("entry")}
              />
              <span>Entrada</span>
            </label>
            {EXIT_KIND_OPTIONS.map((opt) => (
              <label key={opt.value} className="inv-edit-doc-kind">
                <input
                  type="radio"
                  name="movementKind"
                  checked={movementKind === opt.value}
                  onChange={() => setMovementKind(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {exitKind === "sale" || exitKind === "credit" ? (
          <label className="inv-edit-doc-field">
            <span>Cliente{exitKind === "sale" ? " (obligatorio)" : ""}</span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required={exitKind === "sale"}
              maxLength={200}
            />
          </label>
        ) : null}

        {exitKind === "warranty" ? (
          <label className="inv-edit-doc-field">
            <span>Factura original (obligatorio)</span>
            <input
              type="text"
              value={relatedInvoiceNumber}
              onChange={(e) => setRelatedInvoiceNumber(e.target.value)}
              required
              maxLength={80}
            />
          </label>
        ) : null}

        <label className="inv-edit-doc-field">
          <span>Notas del comprobante</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </label>

        <div className="inv-edit-doc-add">
          <label className="inv-edit-doc-field inv-edit-doc-field--search">
            <span>Agregar producto</span>
            <div className="inv-edit-doc-search-row">
              <Search size={16} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o referencia…"
                autoComplete="off"
              />
            </div>
          </label>
          {catalogLoading ? <p className="inv-edit-doc-catalog-hint">Buscando…</p> : null}
          {searchQ && catalog.length > 0 ? (
            <ul className="inv-edit-doc-catalog">
              {catalog
                .filter((item) => !cartProductIds.has(item.id))
                .slice(0, 8)
                .map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => addProduct(item)}>
                      <Plus size={14} strokeWidth={2} aria-hidden />
                      <span>
                        {item.referenceCode} · {item.name}
                      </span>
                      <span className="inv-edit-doc-catalog__stock">Stock {item.quantityOnHand}</span>
                    </button>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>

        <VisualCart
          lines={cart}
          mode={cartMode}
          onQtyChange={onQtyChange}
          onRemove={onRemove}
          onUnitSalePriceChange={cartMode === "exit" ? onUnitSalePriceChange : undefined}
          lockBarcodeQty={false}
        />

        {displayError ? (
          <p className="form-error" role="alert">
            {displayError}
          </p>
        ) : null}

        <div className="inv-modal__actions">
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose} disabled={saving}>
            <X size={18} strokeWidth={2} aria-hidden />
            Cancelar
          </button>
          <button type="submit" className="inv-btn inv-btn--primary" disabled={saving || cart.length === 0}>
            <Save size={18} strokeWidth={2} aria-hidden />
            {saving ? "Guardando…" : "Guardar y actualizar inventario"}
          </button>
        </div>
      </form>
    </div>
  );
}
