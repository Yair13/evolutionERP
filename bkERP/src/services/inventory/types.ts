export type StockSignal = "ok" | "low" | "critical" | "out";

export type CatalogItem = {
  id: string;
  referenceCode: string;
  sku: string | null;
  internalCode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  baseSalePrice: number;
  productionCost?: number;
  marginPercent: number | null;
  barcode: string | null;
  imageUrl: string | null;
  /** Variante grande para zoom / detalle */
  imageUrlLg?: string | null;
  quantityOnHand: number;
  minStockLevel: number;
  criticalStockLevel?: number;
  stockSignal: StockSignal;
  /** Umbrales guardados para esta sede (warehouse_product_settings). */
  semaphoreConfigured?: boolean;
  isActive: boolean;
};

export type ProductImageVariants = {
  xs?: string;
  sm?: string;
  md?: string;
  lg?: string;
};

export type ProductDetail = CatalogItem & {
  images: {
    id: string;
    url: string;
    thumbUrl: string | null;
    variants?: ProductImageVariants;
    isPrimary: boolean;
  }[];
  warehousePrices?: {
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    salePrice: number | null;
  }[];
  createdAt: string;
  updatedAt: string;
};
