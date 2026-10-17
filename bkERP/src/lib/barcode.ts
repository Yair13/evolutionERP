/** El código de barras del producto es exactamente su mismo código (ej. EVOLUTIONS01). */
export function generateProductBarcode(referenceCode: string): string {
  return referenceCode.trim().toUpperCase();
}

