/** Precio unitario de salida: entero COP, nunca por debajo del sugerido del catálogo. */
export function clampUnitSalePrice(value: number, suggestedSalePrice: number): number {
  const min = Math.round(Number(suggestedSalePrice) || 0);
  const n = Math.round(Number(value) || 0);
  return Math.max(n, min);
}

export function isUnitSalePriceValid(unitSalePrice: number, suggestedSalePrice: number): boolean {
  return Math.round(unitSalePrice) >= Math.round(Number(suggestedSalePrice) || 0);
}

/** Muestra dígitos con separador de miles (es-CO). */
export function formatUnitPriceDigits(digits: string): string {
  const clean = digits.replace(/[^\d]/g, "");
  if (!clean) return "";
  const n = Number(clean);
  return Number.isFinite(n)
    ? n.toLocaleString("es-CO", { maximumFractionDigits: 0 })
    : clean;
}

/** Parsea texto del campo de precio (solo dígitos). Vacío = sin confirmar. */
export function parseUnitSalePriceDraft(raw: string): number | null {
  const digits = raw.trim().replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function cartHasInvalidSalePrices(
  lines: { unitSalePrice: number; suggestedSalePrice: number }[]
): boolean {
  return lines.some((l) => !isUnitSalePriceValid(l.unitSalePrice, l.suggestedSalePrice));
}
