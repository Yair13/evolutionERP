import type { CatalogItem } from "../features/inventory/inventory.types.js";

/**
 * Caché en memoria de resoluciones de escaneo por sede.
 * Evita GET /inventory/scan repetidos del mismo producto en tablets con red intermitente.
 */
const cache = new Map<string, Map<string, CatalogItem>>();

function warehouseMap(warehouseId: string): Map<string, CatalogItem> {
  let m = cache.get(warehouseId);
  if (!m) {
    m = new Map();
    cache.set(warehouseId, m);
  }
  return m;
}

function keysForItem(item: CatalogItem): string[] {
  return [item.barcode, item.referenceCode, item.sku, item.internalCode]
    .map((k) => (k ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function getCachedScan(warehouseId: string, code: string): CatalogItem | null {
  const key = code.trim().toLowerCase();
  if (!key) return null;
  return warehouseMap(warehouseId).get(key) ?? null;
}

export function putCachedScan(warehouseId: string, item: CatalogItem): void {
  const m = warehouseMap(warehouseId);
  for (const key of keysForItem(item)) {
    m.set(key, item);
  }
}

/** Indexa una página de catálogo ya cargada para futuros escaneos sin red. */
export function warmScanCache(warehouseId: string, items: CatalogItem[]): void {
  for (const item of items) putCachedScan(warehouseId, item);
}

export function clearScanCache(warehouseId?: string): void {
  if (warehouseId) cache.delete(warehouseId);
  else cache.clear();
}
