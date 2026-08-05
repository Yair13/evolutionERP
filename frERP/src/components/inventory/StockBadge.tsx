import type { StockSignal } from "../../features/inventory/inventory.types.js";

const LABELS: Record<StockSignal, string> = {
  ok: "En stock",
  low: "Stock bajo",
  critical: "Crítico",
  out: "Sin stock",
};

type Props = {
  signal: StockSignal;
  quantity?: number;
  className?: string;
};

export function StockBadge({ signal, quantity, className = "" }: Props) {
  const qtyText =
    quantity != null
      ? Number.isInteger(quantity)
        ? String(quantity)
        : quantity.toLocaleString("es-CO", { maximumFractionDigits: 2 })
      : null;

  return (
    <span className={`inv-stock inv-stock--${signal}${className ? ` ${className}` : ""}`}>
      <span className="inv-stock__dot" aria-hidden />
      {qtyText != null ? <span className="inv-stock__qty">{qtyText}</span> : null}
      <span className="inv-stock__label">{LABELS[signal]}</span>
    </span>
  );
}
