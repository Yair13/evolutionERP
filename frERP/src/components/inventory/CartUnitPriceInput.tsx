import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
      setWarning(`Mínimo ${formatMoney(suggestedSalePrice)} / ud`);
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

  return (
    <div className={`inv-cart__price-edit${compact ? " inv-cart__price-edit--compact" : ""}`}>
      <label className="inv-cart__price-label">
        <span className={compact ? "inv-cart__price-label-short" : undefined}>
          {compact ? "$/ud" : "Valor salida / ud"}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={displayValue}
          className={warning ? "is-warning" : undefined}
          onFocus={() => setFocused(true)}
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
          aria-label={`Valor de salida por unidad ${productName}`}
        />
      </label>
      {warning ? (
        <p className="inv-cart__price-warning" role="status">
          <AlertTriangle size={14} strokeWidth={2.25} aria-hidden />
          <span>{warning}</span>
        </p>
      ) : null}
    </div>
  );
}
