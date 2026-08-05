/** Genera un código único legible para pistolas (Code 128 / alfanumérico). */
export function generateProductBarcode(referenceCode: string): string {
  const base = referenceCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  return `EV${base.padEnd(4, "0").slice(0, 4)}${suffix}`;
}
