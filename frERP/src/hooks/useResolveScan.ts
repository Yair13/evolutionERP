import { useCallback } from "react";
import { scanProduct } from "../api/inventory.js";
import type { CatalogItem } from "../features/inventory/inventory.types.js";
import { getCachedScan, putCachedScan } from "../lib/scanCache.js";
import { matchByScanCode, toScanCatalogItem, type ScanMatchable } from "../lib/scanMatch.js";

type ResolveScanOptions = {
  /**
   * Fuentes locales (catálogo en pantalla, carrito precargado, etc.).
   * Se consultan antes de la red para zonas con internet intermitente.
   */
  getLocalItems?: () => ScanMatchable[];
  /** Si true y no hay match local, no llama al servidor (útil en verificación de recepción). */
  localOnly?: boolean;
};

export function useResolveScan(
  token: string | null,
  warehouseId: string | null,
  options?: ResolveScanOptions
) {
  const { getLocalItems, localOnly = false } = options ?? {};

  return useCallback(
    async (code: string): Promise<CatalogItem> => {
      const trimmed = code.trim();
      if (!trimmed) throw new Error("Código vacío");

      const localItems = getLocalItems?.() ?? [];
      const localHit = matchByScanCode(trimmed, localItems);
      if (localHit) {
        const item = toScanCatalogItem(localHit as ScanMatchable & Partial<CatalogItem>);
        if (warehouseId) putCachedScan(warehouseId, item);
        return item;
      }

      if (warehouseId) {
        const cached = getCachedScan(warehouseId, trimmed);
        if (cached) return cached;
      }

      if (localOnly) {
        throw new Error("Código no corresponde a ningún producto del despacho");
      }

      if (!token || !warehouseId) throw new Error("Sin sesión o sede");

      try {
        const { item } = await scanProduct(token, warehouseId, trimmed);
        putCachedScan(warehouseId, item);
        return item;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "product_not_found") throw new Error("Producto no encontrado para ese código");
        throw err;
      }
    },
    [token, warehouseId, getLocalItems, localOnly]
  );
}
