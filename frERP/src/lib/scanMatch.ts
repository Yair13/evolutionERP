import type { CatalogItem } from "../features/inventory/inventory.types.js";

/** Campos mínimos para resolver un código de barras / referencia en local. */
export type ScanMatchable = {
  id: string;
  name: string;
  barcode?: string | null;
  referenceCode?: string | null;
  sku?: string | null;
  internalCode?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Compara código escaneado contra barcode / referencia / sku / interno (sin red). */
export function codesEqual(scanned: string, candidate: string | null | undefined): boolean {
  const a = norm(scanned);
  const b = norm(candidate);
  return a.length > 0 && a === b;
}

export function matchByScanCode<T extends ScanMatchable>(code: string, items: T[]): T | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  return (
    items.find(
      (it) =>
        codesEqual(trimmed, it.barcode) ||
        codesEqual(trimmed, it.referenceCode) ||
        codesEqual(trimmed, it.sku) ||
        codesEqual(trimmed, it.internalCode)
    ) ?? null
  );
}

/** Convierte una línea de carrito / match local en CatalogItem mínimo para el flujo POS. */
export function toScanCatalogItem(
  src: ScanMatchable & Partial<CatalogItem>,
  defaults?: Partial<CatalogItem>
): CatalogItem {
  return {
    id: src.id,
    referenceCode: src.referenceCode ?? "",
    sku: src.sku ?? null,
    internalCode: src.internalCode ?? null,
    name: src.name,
    description: src.description ?? null,
    brand: src.brand ?? null,
    unit: src.unit ?? "und",
    status: src.status ?? "active",
    categoryId: src.categoryId ?? null,
    categoryName: src.categoryName ?? null,
    baseSalePrice: src.baseSalePrice ?? defaults?.baseSalePrice ?? 0,
    productionCost: src.productionCost,
    marginPercent: src.marginPercent ?? null,
    barcode: src.barcode ?? null,
    imageUrl: src.imageUrl ?? null,
    imageUrlLg: src.imageUrlLg,
    quantityOnHand: src.quantityOnHand ?? defaults?.quantityOnHand ?? 0,
    minStockLevel: src.minStockLevel ?? 0,
    criticalStockLevel: src.criticalStockLevel,
    stockSignal: src.stockSignal ?? "ok",
    semaphoreConfigured: src.semaphoreConfigured,
    isActive: src.isActive ?? true,
  };
}
