import type { CartLine, DocType, ExitKind } from "../features/inventory/inventory.types.js";

type PosDraft = {
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
