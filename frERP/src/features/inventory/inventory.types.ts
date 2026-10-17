export type StockSignal = "ok" | "low" | "critical" | "out";

export type StockSemaphoreSummary = {
  ok: number;
  low: number;
  critical: number;
  out: number;
  total: number;
};

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
  imageUrlLg?: string | null;
  quantityOnHand: number;
  minStockLevel: number;
  criticalStockLevel?: number;
  stockSignal: StockSignal;
  /** Alertas de stock: mínimo/crítico guardados en la sede actual. */
  semaphoreConfigured?: boolean;
  isActive: boolean;
};

export type ProductCategory = {
  id: string;
  name: string;
};

export type WarehouseOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_factory?: boolean;
};

export type DocType = "entry" | "exit";

export type ExitKind = "sale" | "return" | "credit" | "warranty" | "distribution" | "transfer" | "return_to_factory" | "exchange";

export type MovementKind = "entry" | ExitKind;

export type CartLine = {
  productId: string;
  name: string;
  referenceCode: string;
  barcode?: string | null;
  imageUrl: string | null;
  /** Precio sugerido del catálogo (mínimo permitido en salida) */
  suggestedSalePrice: number;
  /** Precio unitario de salida (editable, >= suggestedSalePrice) */
  unitSalePrice: number;
  quantityOnHand: number;
  quantity: number;
  isReturn?: boolean;
};

export type ProductImageVariants = {
  xs?: string;
  sm?: string;
  md?: string;
  lg?: string;
};

export type ProductImage = {
  id: string;
  url: string;
  thumbUrl: string | null;
  variants?: ProductImageVariants;
  isPrimary: boolean;
};

export type ProductDetail = CatalogItem & {
  images: ProductImage[];
  warehousePrices?: {
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    salePrice: number | null;
  }[];
  createdAt?: string;
  updatedAt?: string;
};

export type UtilitiesPeriod = {
  revenue: number;
  cost: number;
  expenses: number;
  profit: number;
  salesUnits: number;
  documentCount: number;
};

export type UtilitiesProductRow = {
  productId: string;
  name: string;
  referenceCode: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  units: number;
};

export type UtilitiesSummary = {
  generatedAt: string;
  warehouseId: string | null;
  today: UtilitiesPeriod;
  month: UtilitiesPeriod;
  profitTrend: { date: string; profit: number; revenue: number }[];
  topProfitable: UtilitiesProductRow[];
  lowMargin: UtilitiesProductRow[];
};

export type DocumentStatusEvent = {
  id: string;
  status: string;
  comment: string | null;
  createdAt: string;
  actorName: string | null;
};

export type InventoryDocumentLine = {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  barcode?: string | null;
  imageUrl: string | null;
  quantity: number;
  unitSalePrice: number | null;
  unitCost: number | null;
};

export type InventoryDocumentDetail = {
  id: string;
  warehouseId?: string;
  docType: DocType | "warranty" | "return" | "adjustment";
  status: string;
  notes: string | null;
  reason?: string | null;
  lineCount: number;
  totalQuantity: number;
  createdAt: string;
  completedAt: string | null;
  createdByName: string | null;
  invoiceNumber?: string | null;
  exitKind?: ExitKind | null;
  customerName?: string | null;
  customerTaxId?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  relatedInvoiceNumber?: string | null;
  productionOrderCode?: string | null;
  entryType?: string | null;
  labelsPrintedAt?: string | null;
  warehouseName?: string | null;
  warehouseCode?: string | null;
  totalAmount?: number;
  editCount?: number;
  lastEditObservation?: string | null;
  lastUnlockObservation?: string | null;
  editingUnlocked?: boolean;
  metadata?: any;
  lines: InventoryDocumentLine[];
  events?: DocumentStatusEvent[];
};

export type InventoryDocumentSummary = Omit<InventoryDocumentDetail, "lines">;

export type CountKind = "initial" | "audit";
export type CountStatus = "open" | "completed" | "cancelled";

export type InventoryCountLine = {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  barcode: string | null;
  imageUrl: string | null;
  unit: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
};

export type InventoryCountSummary = {
  id: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCode: string | null;
  status: CountStatus;
  countKind: CountKind;
  notes: string | null;
  invoiceNumber: string | null;
  documentId: string | null;
  createdAt: string;
  completedAt: string | null;
  createdByName: string | null;
  lineCount: number;
  matchedCount: number;
  shortCount: number;
  overCount: number;
  pendingCount: number;
  expectedTotal: number;
  countedTotal: number;
};

export type InventoryCountDetail = InventoryCountSummary & {
  lines: InventoryCountLine[];
};
