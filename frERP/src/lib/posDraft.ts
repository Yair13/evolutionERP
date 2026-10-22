import type { CartLine, DocType, ExitKind } from "../features/inventory/inventory.types.js";

export type CachedPhoto = {
  name: string;
  type: string;
  base64: string;
};

export type CheckoutDraft = {
  open: boolean;
  customerName?: string;
  customerId?: string | null;
  selectedCustomer?: any;
  payments?: Array<{ id: number; method: string; amount: string }>;
  notes?: string;
  relatedInvoiceNumber?: string;
  destinationWarehouseId?: string;
  selectedLayawayId?: string | null;
  cachedPhotos?: CachedPhoto[];
  discountAmount?: number;
  discountReason?: string;
};

export type PosDraft = {
  v: 1;
  mode: DocType;
  warehouseId: string;
  cart: CartLine[];
  notes: string;
  entryType?: string;
  exitKind?: ExitKind;
  originInvoiceNumber?: string;
  scannedByProduct?: Record<string, number>;
  savedAt: number;
  checkoutDraft?: CheckoutDraft;
};

const PREFIX = "inv-pos-draft:v1:";

function key(mode: DocType, warehouseId: string): string {
  return `${PREFIX}${mode}:${warehouseId}`;
}

export function loadPosDraft(mode: DocType, warehouseId: string): PosDraft | null {
  try {
    const raw = localStorage.getItem(key(mode, warehouseId));
    if (!raw) return null;
    const data = JSON.parse(raw) as PosDraft;
    if (data?.v !== 1 || data.mode !== mode || data.warehouseId !== warehouseId) return null;
    if (!Array.isArray(data.cart)) return null;
    return data;
  } catch {
    return null;
  }
}

export function savePosDraft(draft: Omit<PosDraft, "v" | "savedAt">): void {
  try {
    const payload: PosDraft = { ...draft, v: 1, savedAt: Date.now() };
    localStorage.setItem(key(draft.mode, draft.warehouseId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearPosDraft(mode: DocType, warehouseId: string): void {
  try {
    localStorage.removeItem(key(mode, warehouseId));
  } catch {
    /* ignore */
  }
}

export function saveCheckoutDraft(warehouseId: string, checkout: CheckoutDraft): void {
  try {
    const draft = loadPosDraft("exit", warehouseId);
    if (!draft) return;
    savePosDraft({ ...draft, checkoutDraft: checkout });
  } catch {
    /* ignore */
  }
}

export function clearCheckoutDraft(warehouseId: string): void {
  try {
    const draft = loadPosDraft("exit", warehouseId);
    if (!draft) return;
    savePosDraft({ ...draft, checkoutDraft: undefined });
  } catch {
    /* ignore */
  }
}

export function clearAllPosDrafts(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

