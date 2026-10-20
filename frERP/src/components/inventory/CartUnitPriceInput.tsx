import { useEffect, useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { formatUnitPriceDigits, parseUnitSalePriceDraft } from "../../lib/salePrice.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  productId: string;
  productName: string;
  unitSalePrice: number;
  suggestedSalePrice: number;
  onCommit: (productId: string, unitSalePrice: number) => void;
  /** Fila compacta en carrito POS */
  compact?: boolean;
};

export function CartUnitPriceInput({
  productId,
  productName,
  unitSalePrice,
  suggestedSalePrice,
  onCommit,
  compact = false,
}: Props) {
  const [draftDigits, setDraftDigits] = useState(String(unitSalePrice));
  const [focused, setFocused] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setDraftDigits(String(unitSalePrice));
    setWarning(null);
    setFocused(false);
  }, [productId, unitSalePrice]);

  function commit(raw: string) {
    const parsed = parseUnitSalePriceDraft(raw);
    if (parsed == null) {
      setDraftDigits(String(unitSalePrice));
      setWarning(null);
      return;
    }
    if (parsed < suggestedSalePrice) {
      setWarning(`Mínimo permitido: ${formatMoney(suggestedSalePrice)}`);
      setDraftDigits(String(suggestedSalePrice));
      onCommit(productId, suggestedSalePrice);
      return;
    }
    setWarning(null);
    setDraftDigits(String(parsed));
    onCommit(productId, parsed);
  }

  useEffect(() => {
    if (!warning) return;
    const t = window.setTimeout(() => setWarning(null), 5000);
    return () => window.clearTimeout(t);
  }, [warning]);

  const displayValue = focused ? draftDigits : formatUnitPriceDigits(draftDigits);
  const isCustomPrice = unitSalePrice !== suggestedSalePrice;

  return (
    <div className={`inv-cart__price-edit${compact ? " inv-cart__price-edit--compact" : ""}`}>
      <label
        className="inv-cart__price-label"
        title={`Clic para editar precio de venta. Mínimo catálogo: ${formatMoney(suggestedSalePrice)}`}
      >
        <span className={compact ? "inv-cart__price-label-short" : undefined}>
          {compact ? "Precio c/u" : "Precio unitario de venta"}
        </span>
        <div
          className={`inv-cart__price-input-wrap${warning ? " is-warning" : ""}${
            isCustomPrice ? " is-modified" : ""
          }`}
        >
          <span className="inv-cart__price-currency">$</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={displayValue}
            placeholder={formatUnitPriceDigits(String(suggestedSalePrice))}
            onFocus={(e) => {
              setFocused(true);
              e.target.select();
            }}
            onChange={(e) => {
              setDraftDigits(e.target.value.replace(/[^\d]/g, ""));
              setWarning(null);
            }}
            onBlur={() => {
              setFocused(false);
              commit(draftDigits);
              /* Devuelve el foco a la pistola al terminar de editar el precio. */
              window.setTimeout(() => {
                document.getElementById("inv-pistol-input")?.focus({ preventScroll: true });
              }, 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={`Precio unitario de salida ${productName}`}
          />
          <Pencil size={12} className="inv-cart__price-pencil" aria-hidden />
        </div>
      </label>
      {warning ? (
        <p className="inv-cart__price-warning" role="status">
          <AlertTriangle size={13} strokeWidth={2.25} aria-hidden />
          <span>{warning}</span>
        </p>
      ) : isCustomPrice ? (
        <span
          className="inv-cart__price-custom-badge"
          title={`Precio base catálogo: ${formatMoney(suggestedSalePrice)}`}
        >
          Precio editado
        </span>
      ) : null}
    </div>
  );
}
