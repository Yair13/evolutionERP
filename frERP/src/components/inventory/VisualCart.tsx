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
};

export function VisualCart({
  lines,
  mode,
  onQtyChange,
  onRemove,
  onUnitSalePriceChange,
  locked = false,
  showValues = true,
}: Props) {
  const isExit = mode === "exit";
  const showMoney = isExit && showValues;
  const readOnlyQty = locked || !onQtyChange;
  const totalUnits = lines.reduce((s, l) => s + (l.isReturn ? -l.quantity : l.quantity), 0);
  const totalValue = isExit
    ? lines.reduce((s, l) => s + (l.isReturn ? -l.quantity : l.quantity) * l.unitSalePrice, 0)
    : 0;

  if (lines.length === 0) {
    return (
      <div className="inv-cart inv-cart--empty">
        <p>
          {locked
            ? "El carrito está vacío. Precarga el código de movimiento para traer los productos."
            : "Carrito vacío. Pistolea o toca un producto — aquí verá el cliente lo que va llevando."}
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
                      suggestedSalePrice={line.suggestedSalePrice}
                      onCommit={onUnitSalePriceChange}
                    />
                  ) : null}
                  {readOnlyQty ? (
                    <span className="inv-cart__qty inv-cart__qty--readonly">
                      {line.quantity} ud
                    </span>
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
        <footer className="inv-cart__foot">
          <span>Total</span>
          <strong>{formatMoney(totalValue)}</strong>
        </footer>
      ) : null}
    </div>
  );
}
