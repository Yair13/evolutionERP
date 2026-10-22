import { apiGet, apiPost } from "./client.js";
import type {
  CatalogItem,
  CountKind,
  CountStatus,
  InventoryCountDetail,
  InventoryCountSummary,
  ProductCategory,
  ProductDetail,
  ProductImage,
  StockSemaphoreSummary,
  StockSignal,
} from "../features/inventory/inventory.types.js";

function whHeaders(warehouseId?: string | null): Record<string, string> {
  if (!warehouseId) return {};
  return { "X-Warehouse-Id": warehouseId };
}

async function inventoryFetch<T>(
  path: string,
  token: string,
  warehouseId?: string | null,
  init?: RequestInit
): Promise<T> {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...whHeaders(warehouseId),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchProductCatalog(
  token: string,
  params?: { q?: string; categoryId?: string; offset?: number; limit?: number }
) {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.categoryId) q.set("categoryId", params.categoryId);
  if (params?.offset != null) q.set("offset", String(params.offset));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiGet<{ items: CatalogItem[]; total: number }>(
    `/inventory/product-catalog${qs ? `?${qs}` : ""}`,
    token
  );
}

export async function fetchProductMaster(token: string, id: string) {
  return apiGet<{ item: ProductDetail }>(`/inventory/products/${id}`, token);
}

export async function fetchCatalog(
  token: string,
  warehouseId: string,
  params?: {
    q?: string;
    categoryId?: string;
    offset?: number;
    limit?: number;
    withoutBarcode?: boolean;
    withBarcode?: boolean;
  }
) {
  const q = new URLSearchParams({ warehouseId });
  if (params?.q) q.set("q", params.q);
  if (params?.categoryId) q.set("categoryId", params.categoryId);
  if (params?.offset != null) q.set("offset", String(params.offset));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.withoutBarcode) q.set("withoutBarcode", "1");
  if (params?.withBarcode) q.set("withBarcode", "1");
  return inventoryFetch<{ items: CatalogItem[]; total: number }>(
    `/inventory/catalog?${q}`,
    token,
    warehouseId
  );
}

export async function fetchCategories(token: string) {
  return apiGet<{ items: ProductCategory[] }>("/inventory/categories", token);
}

export async function fetchStockSemaphoreSummary(token: string, warehouseId: string) {
  return inventoryFetch<{ summary: StockSemaphoreSummary; warehouseId: string }>(
    `/inventory/semaphore/summary?warehouseId=${warehouseId}`,
    token,
    warehouseId
  );
}

export async function fetchStockSemaphore(
  token: string,
  warehouseId: string,
  params?: { signal?: StockSignal; q?: string; limit?: number; offset?: number }
) {
  const q = new URLSearchParams({ warehouseId });
  if (params?.signal) q.set("signal", params.signal);
  if (params?.q) q.set("q", params.q);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  return inventoryFetch<{ items: CatalogItem[]; total: number }>(
    `/inventory/semaphore?${q}`,
    token,
    warehouseId
  );
}

export async function fetchProduct(token: string, warehouseId: string, id: string) {
  return inventoryFetch<{ item: ProductDetail }>(
    `/inventory/products/${id}?warehouseId=${warehouseId}`,
    token,
    warehouseId
  );
}

export async function uploadProductImages(token: string, productId: string, files: File[]) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const form = new FormData();
  for (const f of files) form.append("images", f);
  const res = await fetch(`${base}/inventory/products/${productId}/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ images: ProductImage[] }>;
}

export async function deleteProductImage(token: string, productId: string, imageId: string) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/inventory/products/${productId}/images/${imageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export type DeleteProductResponse = {
  ok: boolean;
  action: "deleted" | "deactivated";
  message: string;
};

export async function deleteProduct(
  token: string,
  productId: string
): Promise<DeleteProductResponse> {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/inventory/products/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<DeleteProductResponse>;
}

export type CreateProductPayload = {
  name: string;
  referenceCode: string;
  sku?: string | null;
  internalCode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  unit?: string;
  baseSalePrice: number;
  productionCost?: number;
  minStockLevel?: number;
  criticalStockLevel?: number;
  initialStock?: number;
  imageUrls?: string[];
  barcode?: string | null;
  /** Si es false, no se genera código de barras (producto buscable por clic en salida). */
  hasBarcode?: boolean;
  /** Sede donde aplicar stock mínimo / entrada inicial (opcional). */
  stockWarehouseId?: string | null;
  warehousePrices?: { warehouseId: string; salePrice: number | null }[];
};

export async function createProduct(token: string, body: CreateProductPayload) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (body.stockWarehouseId) {
    headers["X-Warehouse-Id"] = body.stockWarehouseId;
  }
  const res = await fetch(`${base}/inventory/products`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ item: CatalogItem }>;
}

export async function createCategory(token: string, name: string) {
  return apiPost<{ item: ProductCategory }>("/inventory/categories", { name }, token);
}

export async function scanProduct(token: string, warehouseId: string, code: string) {
  const encoded = encodeURIComponent(code.trim());
  return inventoryFetch<{ item: CatalogItem }>(
    `/inventory/scan/${encoded}?warehouseId=${warehouseId}`,
    token,
    warehouseId
  );
}

export type ConfirmMovementPayload = {
  docType: import("../features/inventory/inventory.types.js").DocType;
  lines: { productId: string; quantity: number }[];
  notes?: string | null;
  entryType?: string | null;
  originInvoiceNumber?: string | null;
};

export type ConfirmExitPayload = {
  exitKind: import("../features/inventory/inventory.types.js").ExitKind;
  lines: { productId: string; quantity: number; unitSalePrice?: number; isReturn?: boolean }[];
  notes?: string | null;
  customerName?: string | null;
  relatedInvoiceNumber?: string | null;
  customerId?: string | null;
  paymentMethod?: string | null;
  paymentBreakdown?: { method: string; amount: number }[] | null;
  destinationWarehouseId?: string | null;
  layawayId?: string | null;
  receiptUrl?: string | null;
  receiptUrls?: string[] | null;
  receiptFilename?: string | null;
  discountAmount?: number;
  discountReason?: string | null;
};

export async function confirmMovement(
  token: string,
  warehouseId: string,
  body: ConfirmMovementPayload
) {
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/confirm?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function confirmExit(
  token: string,
  warehouseId: string,
  body: ConfirmExitPayload
) {
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/confirm-exit?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchUtilitiesSummary(token: string, warehouseId?: string) {
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  return apiGet<import("../features/inventory/inventory.types.js").UtilitiesSummary>(
    `/inventory/utilities/summary${q}`,
    token
  );
}

export async function fetchDocuments(
  token: string,
  warehouseId?: string | null,
  docType?: "entry" | "exit" | "adjustment",
  dates?: { from?: string; to?: string }
) {
  const q = new URLSearchParams();
  if (warehouseId) q.set("warehouseId", warehouseId);
  if (docType) q.set("docType", docType);
  if (dates?.from) q.set("dateFrom", dates.from);
  if (dates?.to) q.set("dateTo", dates.to);
  const qs = q.toString();
  return inventoryFetch<{ items: import("../features/inventory/inventory.types.js").InventoryDocumentSummary[]; total: number }>(
    `/inventory/documents${qs ? `?${qs}` : ""}`,
    token,
    warehouseId ?? null
  );
}

export async function fetchDocument(
  token: string,
  documentId: string,
  warehouseId?: string | null
) {
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/${documentId}${q}`,
    token,
    warehouseId ?? null
  );
}

export async function unlockInventoryDocument(
  token: string,
  documentId: string,
  body: { observation: string },
  warehouseId?: string | null
) {
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/${documentId}/unlock-edit${q}`,
    token,
    warehouseId ?? null,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export type EditInventoryDocumentPayload = {
  movementKind: import("../features/inventory/inventory.types.js").MovementKind;
  lines: { productId: string; quantity: number; unitSalePrice?: number }[];
  notes?: string | null;
  customerName?: string | null;
  relatedInvoiceNumber?: string | null;
};

export async function editInventoryDocument(
  token: string,
  documentId: string,
  body: EditInventoryDocumentPayload,
  warehouseId?: string | null
) {
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/${documentId}${q}`,
    token,
    warehouseId ?? null,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function updateProduct(
  token: string,
  id: string,
  body: Partial<CreateProductPayload>,
  warehouseId?: string | null
) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  if (warehouseId) headers["X-Warehouse-Id"] = warehouseId;

  const res = await fetch(`${base}/inventory/products/${id}${q}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ item: ProductDetail }>;
}

export async function cancelInventoryDocument(
  token: string,
  documentId: string,
  warehouseId?: string | null
) {
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/${documentId}/cancel${q}`,
    token,
    warehouseId ?? null,
    {
      method: "POST",
    }
  );
}

/** Marca las etiquetas de una OP como impresas (una sola vez). */
export async function markLabelsPrinted(
  token: string,
  documentId: string,
  warehouseId?: string | null
) {
  const q = warehouseId ? `?warehouseId=${warehouseId}` : "";
  return inventoryFetch<{ item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail }>(
    `/inventory/documents/${documentId}/mark-labels-printed${q}`,
    token,
    warehouseId ?? null,
    {
      method: "POST",
    }
  );
}

export type BulkImportProductItem = {
  name: string;
  referenceCode: string;
  baseSalePrice: number;
  productionCost?: number;
  categoryId?: string | null;
  hasBarcode?: boolean;
};

export async function bulkImportProducts(
  token: string,
  products: BulkImportProductItem[],
  opts?: {
    updateExisting?: boolean;
    categoryId?: string | null;
    hasBarcode?: boolean;
  }
) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/inventory/products/bulk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products,
      updateExisting: opts?.updateExisting ?? false,
      categoryId: opts?.categoryId ?? null,
      hasBarcode: opts?.hasBarcode ?? true,
    }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{
    success: boolean;
    imported: number;
    updated?: number;
    duplicates: number;
  }>;
}

/** Actualiza datos del catálogo (sin sede). */
export async function updateProductMaster(
  token: string,
  id: string,
  body: Partial<CreateProductPayload>
) {
  return updateProduct(token, id, body);
}

export type Customer = {
  id: string;
  displayName: string;
  taxId: string | null;
  phone: string | null;
  address: string | null;
  creditBalance?: number;
};

export async function fetchDocumentByInvoice(
  token: string,
  invoiceNumber: string,
  opts?: { warehouseId?: string; entryType?: string }
) {
  const q = new URLSearchParams();
  if (opts?.warehouseId) q.set("warehouseId", opts.warehouseId);
  if (opts?.entryType) q.set("entryType", opts.entryType);
  const qs = q.toString();
  return inventoryFetch<{
    item: import("../features/inventory/inventory.types.js").InventoryDocumentDetail;
    origin?: {
      exitKind: string;
      destinationWarehouseId: string | null;
      alreadyReceived: boolean;
    };
  }>(
    `/inventory/documents/by-invoice/${encodeURIComponent(invoiceNumber)}${qs ? `?${qs}` : ""}`,
    token,
    opts?.warehouseId
  );
}

export async function fetchCustomers(token: string, q?: string) {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiGet<{ items: Customer[] }>(`/inventory/customers${query}`, token);
}

export async function createCustomer(
  token: string,
  data: { displayName: string; taxId?: string; phone?: string; address?: string }
) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/inventory/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const d = await res.json();
      if (d?.error) msg = String(d.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ item: Customer }>;
}

// ─── Conteo físico / inventario inicial ───────────────────────────────────

export async function fetchOpenInventoryCount(token: string, warehouseId: string) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts/open?warehouseId=${warehouseId}`,
    token,
    warehouseId
  );
}

export async function fetchInventoryCount(
  token: string,
  warehouseId: string,
  countId: string
) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts/${countId}?warehouseId=${warehouseId}`,
    token,
    warehouseId
  );
}

export async function fetchInventoryCounts(
  token: string,
  warehouseId: string,
  params?: { status?: CountStatus; limit?: number; offset?: number }
) {
  const q = new URLSearchParams({ warehouseId });
  if (params?.status) q.set("status", params.status);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  return inventoryFetch<{ items: InventoryCountSummary[]; total: number }>(
    `/inventory/counts?${q}`,
    token,
    warehouseId
  );
}

export async function openInventoryCount(
  token: string,
  warehouseId: string,
  body: { countKind: CountKind; notes?: string }
) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function updateInventoryCountLine(
  token: string,
  warehouseId: string,
  countId: string,
  body: { productId: string; countedQuantity?: number; delta?: number }
) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts/${countId}/lines?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function resetInventoryCountCounted(
  token: string,
  warehouseId: string,
  countId: string
) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts/${countId}/reset-counted?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export async function cancelInventoryCount(
  token: string,
  warehouseId: string,
  countId: string
) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts/${countId}/cancel?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export async function confirmInventoryCount(
  token: string,
  warehouseId: string,
  countId: string,
  notes?: string
) {
  return inventoryFetch<{ item: InventoryCountDetail }>(
    `/inventory/counts/${countId}/confirm?warehouseId=${warehouseId}`,
    token,
    warehouseId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes ?? null }),
    }
  );
}
