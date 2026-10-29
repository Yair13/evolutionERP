import { Minus, Plus, Trash2 } from "lucide-react";
import { resolveLightMediaUrl } from "../../lib/mediaUrl.js";
import type { CartLine } from "../../features/inventory/inventory.types.js";
import { CartUnitPriceInput } from "./CartUnitPriceInput.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  lines: CartLine[];
  mode: "entry" | "exit";
  onQtyChange?: (productId: string, quantity: number) => void;
  onRemove?: (productId: string) => void;
  onUnitSalePriceChange?: (productId: string, unitSalePrice: number) => void;
  /** Si true, cantidad fija (viene de factura de origen). */
  locked?: boolean;
  /** Si false, oculta valores (salidas internas a otro almacén). */
  showValues?: boolean;
  /** Si true, bloquea el incremento o cambio manual de cantidad para productos con código de barras en salidas */
  lockBarcodeQty?: boolean;
};

export function VisualCart({
  lines,
  mode,
  onQtyChange,
  onRemove,
  onUnitSalePriceChange,
  locked = false,
  showValues = true,
  lockBarcodeQty = true,
}: Props) {
  const isExit = mode === "exit";
  const showMoney = isExit && showValues;
  const readOnlyQty = locked || !onQtyChange;
  const totalUnits = lines.reduce((s, l) => s + (l.isReturn ? -l.quantity : l.quantity), 0);
  const totalValue = isExit
    ? lines.reduce((s, l) => s + (l.isReturn ? -l.quantity : l.quantity) * l.unitSalePrice, 0)
    : 0;

  const hasReturn = lines.some((l) => Boolean(l.isReturn));
  const hasOutbound = lines.some((l) => !l.isReturn);
  const outboundTotal = lines
    .filter((l) => !l.isReturn)
    .reduce((s, l) => s + l.quantity * l.unitSalePrice, 0);
  const returnTotal = lines
    .filter((l) => Boolean(l.isReturn))
    .reduce((s, l) => s + l.quantity * l.unitSalePrice, 0);

  if (lines.length === 0) {
    return (
      <div className="inv-cart inv-cart--empty">
        <p>
          {locked
            ? "El carrito está vacío. Precarga el código de movimiento para traer los productos."
            : "Carrito vacío. Pistolea o toca un producto — el cliente verá aquí lo que lleva."}
        </p>
      </div>
    );
  }

  return (
    <div className="inv-cart">
      <div className="inv-cart__head">
        <h2 className="inv-cart__title">Carrito</h2>
        <span className="inv-cart__count">{totalUnits} uds</span>
      </div>
      <ul className="inv-cart__list">
        {lines.map((line) => {
          const thumb = resolveLightMediaUrl(line.imageUrl, "xs");
          const lineSubtotal = (line.isReturn ? -line.quantity : line.quantity) * line.unitSalePrice;
          const isBarcodeLocked = Boolean(
            lockBarcodeQty && mode === "exit" && !line.isReturn && line.barcode?.trim()
          );
          return (
            <li key={line.productId} className="inv-cart__line">
              <div className="inv-cart__thumb">
                {thumb ? (
                  <img src={thumb} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="inv-cart__thumb-ph" aria-hidden />
                )}
              </div>
              <div className="inv-cart__body">
                <div className="inv-cart__row-head">
                  <div className="inv-cart__meta">
                    <div className="inv-cart__meta-stack">
                      <span className="inv-cart__name" title={line.name}>
                        {line.name}
                      </span>
                      {line.isReturn && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            background: "#dcfce7",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            marginTop: "2px",
                            width: "fit-content",
                          }}
                        >
                          ↩ Entrada por Retorno (Almacén)
                        </span>
                      )}
                    </div>
                  </div>
                  {showMoney ? (
                    <span className={`inv-cart__line-total${line.isReturn ? " is-return" : ""}`}>
                      {formatMoney(lineSubtotal)}
                    </span>
                  ) : null}
                </div>
                <div className="inv-cart__row-actions">
                  {showMoney && onUnitSalePriceChange ? (
                    <CartUnitPriceInput
                      compact
                      productId={line.productId}
                      productName={line.name}
                      unitSalePrice={line.unitSalePrice}
                      suggestedSalePrice={line.isReturn ? 0 : line.suggestedSalePrice}
                      onCommit={onUnitSalePriceChange}
                    />
                  ) : null}
                  {readOnlyQty ? (
                    <span className="inv-cart__qty inv-cart__qty--readonly">
                      {line.quantity} ud
                    </span>
                  ) : isBarcodeLocked ? (
                    <div className="inv-cart__qty">
                      <button
                        type="button"
                        className="inv-cart__step"
                        aria-label={`Disminuir una unidad de ${line.name}`}
                        onClick={() => onQtyChange!(line.productId, Math.max(1, line.quantity - 1))}
                        disabled={line.quantity <= 1}
                        title={
                          line.quantity <= 1
                            ? "Usa el icono de papelera para quitar el producto"
                            : "Disminuir 1 unidad"
                        }
                      >
                        <Minus size={15} strokeWidth={2} />
                      </button>
                      <span
                        className="inv-cart__qty--readonly"
                        style={{ minWidth: "40px", textAlign: "center", display: "inline-block", cursor: "default" }}
                        title="Producto con etiqueta: para agregar más unidades debes pistolear cada prenda con la pistola"
                      >
                        {line.quantity} ud
                      </span>
                    </div>
                  ) : (
                    <div className="inv-cart__qty">
                      <button
                        type="button"
                        className="inv-cart__step"
                        aria-label="Menos"
                        onClick={() => onQtyChange!(line.productId, Math.max(1, line.quantity - 1))}
                      >
                        <Minus size={15} strokeWidth={2} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={mode === "exit" && !line.isReturn ? line.quantityOnHand : undefined}
                        value={line.quantity}
                        onChange={(e) =>
                          onQtyChange!(line.productId, Math.max(1, Number(e.target.value) || 1))
                        }
                        aria-label={`Cantidad ${line.name}`}
                      />
                      <button
                        type="button"
                        className="inv-cart__step"
                        aria-label="Más"
                        onClick={() =>
                          onQtyChange!(
                            line.productId,
                            mode === "exit" && !line.isReturn
                              ? Math.min(line.quantityOnHand, line.quantity + 1)
                              : line.quantity + 1
                          )
                        }
                        disabled={mode === "exit" && !line.isReturn && line.quantity >= line.quantityOnHand}
                      >
                        <Plus size={15} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                  {onRemove && !locked ? (
                    <button
                      type="button"
                      className="inv-cart__remove"
                      aria-label={`Quitar ${line.name}`}
                      onClick={() => onRemove(line.productId)}
                    >
                      <Trash2 size={16} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {showMoney ? (
        hasReturn && hasOutbound ? (
          <footer className="inv-cart__foot" style={{ flexDirection: "column", gap: "6px", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#64748b" }}>
              <span>Salida (Prendas nuevas):</span>
              <span>{formatMoney(outboundTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#16a34a" }}>
              <span>Retorno (Entra almacén):</span>
              <span>- {formatMoney(returnTotal)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "1rem",
                fontWeight: 700,
                paddingTop: "6px",
                borderTop: "1px dashed #cbd5e1",
              }}
            >
              <span>Excedente a pagar:</span>
              <strong style={{ color: totalValue > 0 ? "#16a34a" : "#0f172a" }}>{formatMoney(totalValue)}</strong>
            </div>
          </footer>
        ) : (
          <footer className="inv-cart__foot">
            <span>Total</span>
            <strong>{formatMoney(totalValue)}</strong>
          </footer>
        )
      ) : null}
    </div>
  );
}
