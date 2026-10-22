import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  Package,
  Plus,
  ScanLine,
  Search,
  ShoppingCart,
  TriangleAlert,
  X,
  ZoomIn,
} from "lucide-react";
import { useResolveScan } from "../../hooks/useResolveScan.js";
import {
  confirmExit,
  confirmMovement,
  fetchCatalog,
  fetchDocumentByInvoice,
  fetchProduct,
} from "../../api/inventory.js";
const BarcodeScannerModal = lazy(() =>
  import("../../components/inventory/BarcodeScannerModal.js").then((m) => ({
    default: m.BarcodeScannerModal,
  }))
);
import { DocumentInvoicePrint } from "../../components/inventory/DocumentInvoicePrint.js";
import {
  ExitCheckoutModal,
  type ExitCheckoutData,
} from "../../components/inventory/ExitCheckoutModal.js";
import { VisualCart } from "../../components/inventory/VisualCart.js";
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { resolveLightMediaUrl, resolveMediaUrl } from "../../lib/mediaUrl.js";
import { clearPosDraft, loadPosDraft, savePosDraft, clearCheckoutDraft } from "../../lib/posDraft.js";
import { clearScanCache, warmScanCache } from "../../lib/scanCache.js";
import type { ScanMatchable } from "../../lib/scanMatch.js";
import { isUnitSalePriceValid } from "../../lib/salePrice.js";
import type { CartLine, CatalogItem, DocType, ExitKind, InventoryDocumentDetail } from "./inventory.types.js";
import { EXIT_KIND_OPTIONS } from "./exit-labels.js";

type Props = {
  mode: DocType;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function catalogToCartLine(item: CatalogItem, qty = 1): CartLine {
  const suggested = item.baseSalePrice;
  return {
    productId: item.id,
    name: item.name,
    referenceCode: item.referenceCode,
    barcode: item.barcode,
    imageUrl: item.imageUrl,
    suggestedSalePrice: suggested,
    unitSalePrice: suggested,
    quantityOnHand: item.quantityOnHand,
    quantity: qty,
  };
}

const PISTOL_DEBOUNCE_MS = 90;
const MIN_SCAN_LENGTH = 2;

export function MovementPosPage({ mode }: Props) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { warehouses, warehouseId, sessionLabel } = useWarehouse();
  const currentWarehouse = useMemo(() => warehouses.find((w) => w.id === warehouseId), [warehouses, warehouseId]);
  const isFactory = currentWarehouse?.is_factory === true;
  const isEntry = mode === "entry";
  const title = isEntry ? "Entrada de inventario" : "Salida de inventario";
  const Icon = isEntry ? ArrowDownToLine : ArrowUpFromLine;

  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pistolCode, setPistolCode] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExitCheckout, setShowExitCheckout] = useState(false);
  const [invoiceDoc, setInvoiceDoc] = useState<InventoryDocumentDetail | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** En móvil el carrito inicia plegado en la barra inferior para dejar ver todo el catálogo. */
  const [cartOpen, setCartOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<{ url: string; name: string } | null>(null);
  const pistolInputRef = useRef<HTMLInputElement>(null);
  const pistolDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pistolBusyRef = useRef(false);
  /** Último valor del input (evita Enter con estado React vacío al pegar/pistolear). */
  const pistolValueRef = useRef("");
  /** Siempre la versión fresca de processPistolScan (listener de pantalla). */
  const processPistolScanRef = useRef<(raw: string) => void>(() => {});
  const draftHydratedRef = useRef<string | null>(null);

  const [entryType, setEntryType] = useState<
    "transfer" | "distribution" | "return_to_factory" | "production_order" | "purchase"
  >("distribution");
  const [exitKind, setExitKind] = useState<ExitKind>("sale");
  const [originInvoiceNumber, setOriginInvoiceNumber] = useState("");
  const [preloading, setPreloading] = useState(false);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  // Verificación de recepción: unidades escaneadas por producto (entradas ligadas a un código)
  const [scannedByProduct, setScannedByProduct] = useState<Record<string, number>>({});
  const [verifyFlash, setVerifyFlash] = useState<string | null>(null);

  const isProductionOrder = isEntry && entryType === "production_order";
  const isPurchase = isEntry && entryType === "purchase";
  const isInvoiceLinkedEntry =
    isEntry &&
    (entryType === "transfer" ||
      entryType === "distribution" ||
      entryType === "return_to_factory");
  const hideCatalogPicker = isInvoiceLinkedEntry;
  // En entradas ligadas la pistola sirve para VERIFICAR lo recibido (no agrega al carrito)
  const verifyMode = isInvoiceLinkedEntry;
  const hidePistol = isProductionOrder || isPurchase || (verifyMode && cart.length === 0);

  const getLocalScanItems = useCallback((): ScanMatchable[] => {
    if (verifyMode && cart.length > 0) {
      return cart.map((l) => ({
        id: l.productId,
        name: l.name,
        barcode: l.barcode,
        referenceCode: l.referenceCode,
        imageUrl: l.imageUrl,
        baseSalePrice: l.suggestedSalePrice,
        quantityOnHand: l.quantityOnHand,
      }));
    }
    // Catálogo visible + carrito: re-escaneos del mismo producto no vuelven a la red
    const fromCart = cart.map((l) => ({
      id: l.productId,
      name: l.name,
      barcode: l.barcode,
      referenceCode: l.referenceCode,
      imageUrl: l.imageUrl,
      baseSalePrice: l.suggestedSalePrice,
      quantityOnHand: l.quantityOnHand,
    }));
    const inCart = new Set(fromCart.map((c) => c.id));
    return [...fromCart, ...products.filter((p) => !inCart.has(p.id))];
  }, [verifyMode, cart, products]);

  const resolveScan = useResolveScan(token, warehouseId, {
    getLocalItems: getLocalScanItems,
    localOnly: verifyMode,
  });

  useEffect(() => {
    if (!isFactory && entryType === "production_order") {
      setEntryType("distribution");
    }
  }, [isFactory, entryType]);

  const allowedExitKinds = useMemo(
    () => EXIT_KIND_OPTIONS.filter((opt) => (opt.value === "distribution" ? isFactory : true)),
    [isFactory]
  );
  // Salidas internas (van a otro almacén, no a cliente): sin valores de venta
  const isInternalExit =
    !isEntry &&
    (exitKind === "distribution" || exitKind === "transfer" || exitKind === "return_to_factory");

  useEffect(() => {
    if (!isFactory && exitKind === "distribution") {
      setExitKind("sale");
    }
  }, [isFactory, exitKind]);

  async function handlePreload() {
    if (!token || !warehouseId || !originInvoiceNumber.trim()) return;
    if (
      entryType !== "transfer" &&
      entryType !== "distribution" &&
      entryType !== "return_to_factory"
    ) {
      return;
    }
    setPreloading(true);
    setPreloadError(null);
    try {
      const data = await fetchDocumentByInvoice(token, originInvoiceNumber.trim(), {
        warehouseId,
        entryType,
      });
      if (!data.item || !data.item.lines) {
        throw new Error("Comprobante sin líneas o no encontrado");
      }
      const cartLines: CartLine[] = data.item.lines
        .filter((l) => Math.abs(Number(l.quantity)) > 0)
        .map((l) => ({
          productId: l.productId,
          name: l.productName,
          referenceCode: l.referenceCode,
          barcode: l.barcode ?? null,
          imageUrl: l.imageUrl,
          suggestedSalePrice: Number(l.unitSalePrice) ?? 0,
          unitSalePrice: Number(l.unitSalePrice) ?? 0,
          quantityOnHand: 0,
          quantity: Math.abs(Number(l.quantity)),
        }));
      setCart(cartLines);
      setScannedByProduct({});
      setSuccess(
        `Se precargaron ${cartLines.length} productos. Ahora verifica con la pistola lo que va llegando.`
      );
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al precargar";
      const wrongTypeMsg =
        entryType === "distribution"
          ? "El código debe ser una salida de tipo Distribución."
          : entryType === "transfer"
            ? "El código debe ser una salida de tipo Traslado."
            : entryType === "return_to_factory"
              ? "El código debe ser una salida de tipo Devolución a Fábrica."
              : "El código no corresponde al tipo de ingreso seleccionado.";
      const friendly: Record<string, string> = {
        origin_invoice_not_found: "No se encontró ese código de movimiento.",
        origin_invoice_wrong_type: wrongTypeMsg,
        origin_invoice_wrong_destination:
          "Este código no está destinado a la sede activa. Solo se puede usar en la sede de destino.",
        origin_invoice_already_received: "Ese código ya fue recibido. Solo se puede usar una vez.",
        origin_invoice_missing_destination: "El movimiento de origen no tiene sede de destino.",
        document_not_found: "No se encontró ese código de movimiento.",
      };
      setPreloadError(friendly[msg] ?? msg);
    } finally {
      setPreloading(false);
    }
  }

  const visibleProducts = products;

  const cartQtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.productId, l.quantity);
    return m;
  }, [cart]);

  const cartTotalValue = useMemo(
    () => cart.reduce((s, l) => s + (l.isReturn ? -l.quantity : l.quantity) * l.unitSalePrice, 0),
    [cart]
  );

  const cartTotalUnits = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  const applyLocalStockDelta = useCallback(
    (lines: { productId: string; quantity: number; isReturn?: boolean }[], direction: "entry" | "exit") => {
      setProducts((prev) =>
        prev.map((p) => {
          const line = lines.find((l) => l.productId === p.id);
          if (!line) return p;
          const signed =
            direction === "entry"
              ? line.quantity
              : line.isReturn
                ? line.quantity
                : -line.quantity;
          const nextQty = Math.max(0, p.quantityOnHand + signed);
          return {
            ...p,
            quantityOnHand: nextQty,
            stockSignal:
              nextQty <= 0
                ? "out"
                : nextQty <= (p.criticalStockLevel ?? 0)
                  ? "critical"
                  : nextQty <= p.minStockLevel
                    ? "low"
                    : "ok",
          };
        })
      );
    },
    []
  );

  const loadProducts = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token || !warehouseId) return;
    // Entradas ligadas a factura: no hace falta el catálogo (solo precarga + verificación local).
    if (hideCatalogPicker) {
      setProducts([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCatalog(token, warehouseId, {
        q: catalogSearch || undefined,
        limit: isEntry && (entryType === "production_order" || entryType === "purchase") ? 100 : 40,
        withoutBarcode: isEntry ? undefined : true,
        withBarcode: undefined,
      });
      setProducts(data.items);
      warmScanCache(warehouseId, data.items);
      const byId = new Map(data.items.map((i) => [i.id, i]));
      setCart((prev) => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map((line) => {
          const fresh = byId.get(line.productId);
          if (!fresh) return line;
          if (
            line.quantityOnHand === fresh.quantityOnHand &&
            line.suggestedSalePrice === fresh.baseSalePrice
          ) {
            return line;
          }
          changed = true;
          return {
            ...line,
            quantityOnHand: fresh.quantityOnHand,
            suggestedSalePrice: fresh.baseSalePrice,
            unitSalePrice: Math.max(line.unitSalePrice, fresh.baseSalePrice),
          };
        });
        return changed ? next : prev;
      });
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : "Error");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [token, warehouseId, catalogSearch, isEntry, entryType, hideCatalogPicker]);

  const refreshCartStock = useCallback(
    async (linesToRefresh?: CartLine[]) => {
      if (!token || !warehouseId || isEntry) return;
      const targetLines = linesToRefresh ?? cart;
      if (targetLines.length === 0) return;
      try {
        const results = await Promise.all(
          targetLines.map((l) =>
            fetchProduct(token, warehouseId, l.productId)
              .then((r) => r.item)
              .catch(() => null)
          )
        );
        const freshMap = new Map(
          results.filter((x): x is NonNullable<typeof x> => x !== null).map((x) => [x.id, x])
        );
        if (freshMap.size === 0) return;
        setCart((prev) =>
          prev.map((line) => {
            const fresh = freshMap.get(line.productId);
            if (!fresh) return line;
            return {
              ...line,
              quantityOnHand: fresh.quantityOnHand,
              suggestedSalePrice: fresh.baseSalePrice,
              unitSalePrice: Math.max(line.unitSalePrice, fresh.baseSalePrice),
            };
          })
        );
      } catch {
        /* ignore background refresh errors */
      }
    },
    [token, warehouseId, isEntry, cart]
  );

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === "hidden") return;
      void loadProducts({ silent: true });
      void refreshCartStock();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [loadProducts, refreshCartStock]);

  // Restaurar borrador tras corte de red / recarga de tablet
  useEffect(() => {
    if (!warehouseId) return;
    const hydrateKey = `${mode}:${warehouseId}`;
    if (draftHydratedRef.current === hydrateKey) return;
    draftHydratedRef.current = hydrateKey;
    const draft = loadPosDraft(mode, warehouseId);
    if (!draft || draft.cart.length === 0) return;
    setCart(draft.cart);
    void refreshCartStock(draft.cart);
    setNotes(draft.notes ?? "");
    if (draft.originInvoiceNumber) setOriginInvoiceNumber(draft.originInvoiceNumber);
    if (draft.scannedByProduct) setScannedByProduct(draft.scannedByProduct);
    if (isEntry && draft.entryType) {
      setEntryType(draft.entryType as typeof entryType);
    }
    if (!isEntry && draft.exitKind) {
      setExitKind(draft.exitKind);
    }
    if (!isEntry && draft.checkoutDraft?.open) {
      setShowExitCheckout(true);
    }
  }, [mode, warehouseId, isEntry, refreshCartStock]);

  // Persistir borrador (carrito + verificación) para no perder trabajo con internet intermitente
  useEffect(() => {
    if (!warehouseId) return;
    if (cart.length === 0 && !notes.trim() && !originInvoiceNumber.trim()) {
      clearPosDraft(mode, warehouseId);
      return;
    }
    const t = window.setTimeout(() => {
      const currentDraft = loadPosDraft(mode, warehouseId);
      savePosDraft({
        mode,
        warehouseId,
        cart,
        notes,
        entryType: isEntry ? entryType : undefined,
        exitKind: !isEntry ? exitKind : undefined,
        originInvoiceNumber: isEntry ? originInvoiceNumber : undefined,
        scannedByProduct: verifyMode ? scannedByProduct : undefined,
        checkoutDraft: currentDraft?.checkoutDraft,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    mode,
    warehouseId,
    cart,
    notes,
    entryType,
    exitKind,
    originInvoiceNumber,
    scannedByProduct,
    isEntry,
    verifyMode,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => setCatalogSearch(catalogQuery.trim()), 260);
    return () => window.clearTimeout(t);
  }, [catalogQuery]);

  /**
   * Receptor invisible de pistola: el foco vuelve ahí solo (sin campo visible ni teclado).
   * Se suelta al editar precio, buscar, config, cantidad o un modal.
   */
  useEffect(() => {
    if (hidePistol) return;

    const overlayOpen = showConfirm || showExitCheckout;

    const mayLeavePistol = (el: Element | null) => {
      if (!el) return false;
      if (el === pistolInputRef.current) return true;
      if (el.closest(".inv-cart__price-edit")) return true;
      if (el.closest(".inv-pos__catalog-search")) return true;
      if (el.closest(".inv-pos-config")) return true;
      if (el.closest(".inv-pos-sellbar")) return true;
      if (el.closest(".inv-pos__notes")) return true;
      if (el.closest(".inv-cart__qty") && el.tagName === "INPUT") return true;
      if (el.closest('[role="dialog"], .inv-modal, .inv-modal-backdrop, .inv-photo-lightbox')) {
        return true;
      }
      return false;
    };

    const focusPistol = () => {
      if (overlayOpen) return;
      const active = document.activeElement;
      if (active instanceof Element && mayLeavePistol(active)) return;
      pistolInputRef.current?.focus({ preventScroll: true });
    };

    focusPistol();

    const onFocusIn = () => {
      window.setTimeout(focusPistol, 0);
    };
    const onPointerUp = () => {
      window.setTimeout(focusPistol, 0);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [hidePistol, showConfirm, showExitCheckout, warehouseId, mode]);

  /**
   * Respaldo: si el foco no está en un campo de texto, captura teclas de la pistola
   * a nivel de pantalla (sin input visible).
   */
  useEffect(() => {
    if (hidePistol) return;

    const bufferRef = { current: "" };
    let lastKeyAt = 0;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      const code = bufferRef.current.trim();
      bufferRef.current = "";
      if (code.length >= MIN_SCAN_LENGTH) processPistolScanRef.current(code);
    };

    const typingInField = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      if (t === pistolInputRef.current) return false;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (t as HTMLInputElement).type;
        return !["button", "submit", "checkbox", "radio", "file", "hidden"].includes(type);
      }
      return t.isContentEditable;
    };

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (showConfirm || showExitCheckout) return;
      if (typingInField(e.target)) return;
      if (document.activeElement === pistolInputRef.current) return;

      if (e.key === "Enter") {
        if (bufferRef.current.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          if (debounce) window.clearTimeout(debounce);
          debounce = null;
          flush();
        }
        return;
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (now - lastKeyAt > 100) bufferRef.current = "";
      lastKeyAt = now;
      bufferRef.current += e.key;
      e.preventDefault();

      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        flush();
      }, PISTOL_DEBOUNCE_MS);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (debounce) window.clearTimeout(debounce);
    };
  }, [hidePistol, showConfirm, showExitCheckout]);

  useEffect(() => {
    if (!lastAdded) return;
    const t = window.setTimeout(() => setLastAdded(null), 2200);
    return () => window.clearTimeout(t);
  }, [lastAdded]);

  useEffect(() => {
    if (!verifyFlash) return;
    const t = window.setTimeout(() => setVerifyFlash(null), 2200);
    return () => window.clearTimeout(t);
  }, [verifyFlash]);

  // Progreso de verificación (entradas ligadas)
  const expectedTotal = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  const verifiedTotal = useMemo(
    () => cart.reduce((s, l) => s + Math.min(scannedByProduct[l.productId] ?? 0, l.quantity), 0),
    [cart, scannedByProduct]
  );
  const allVerified =
    cart.length > 0 && cart.every((l) => (scannedByProduct[l.productId] ?? 0) >= l.quantity);

  function bumpVerified(productId: string, delta: 1 | -1) {
    const line = cart.find((l) => l.productId === productId);
    if (!line) return;
    setScannedByProduct((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.max(0, Math.min(line.quantity, current + delta));
      return { ...prev, [productId]: next };
    });
  }

  function setVerifiedQuantity(productId: string, quantity: number) {
    const line = cart.find((l) => l.productId === productId);
    if (!line || line.barcode) return;
    const next = Math.max(0, Math.min(line.quantity, Math.floor(Number(quantity) || 0)));
    setScannedByProduct((prev) => ({ ...prev, [productId]: next }));
  }

  function handleVerifyScan(item: CatalogItem) {
    const line = cart.find((l) => l.productId === item.id);
    if (!line) {
      setError(`«${item.name}» no viene en este despacho. Revisa el producto.`);
      return;
    }
    const current = scannedByProduct[item.id] ?? 0;
    if (current >= line.quantity) {
      setError(`«${item.name}»: ya verificaste las ${line.quantity} unidades esperadas.`);
      return;
    }
    setScannedByProduct((prev) => ({ ...prev, [item.id]: current + 1 }));
    setError(null);
    setCartOpen(true);
    setVerifyFlash(
      current + 1 >= line.quantity
        ? `${item.name} completo (${line.quantity}/${line.quantity})`
        : `${item.name} (${current + 1}/${line.quantity})`
    );
  }

  /** @returns true si se agregó / aumentó cantidad; false si se rechazó (deja el error ya seteado). */
  function addToCart(item: CatalogItem, opts?: { fromScan?: boolean }): boolean {
    if (isInvoiceLinkedEntry) {
      setError("En este tipo de ingreso los productos solo vienen de la factura asociada. Usa Precargar.");
      return false;
    }
    if (isProductionOrder && opts?.fromScan) {
      setError("En orden de producción agrega productos desde el listado, no con la pistola.");
      return false;
    }
    if (!isEntry && item.barcode && !opts?.fromScan) {
      setError(`«${item.name}» tiene código de barras y solo se puede agregar escaneando con la pistola.`);
      return false;
    }
    if (opts?.fromScan) {
      setProducts((prev) =>
        prev.some((p) => p.id === item.id)
          ? prev.map((p) => (p.id === item.id ? { ...p, ...item } : p))
          : prev
      );
    }
    if (!isEntry && item.quantityOnHand <= 0) {
      setCart((prev) =>
        prev.some((l) => l.productId === item.id)
          ? prev.map((l) =>
              l.productId === item.id ? { ...l, quantityOnHand: item.quantityOnHand } : l
            )
          : prev
      );
      setError(`Sin stock: ${item.name}`);
      return false;
    }
    const existingLine = cart.find((l) => l.productId === item.id);
    if (!isEntry && existingLine && existingLine.quantity >= item.quantityOnHand) {
      if (existingLine.quantityOnHand !== item.quantityOnHand) {
        setCart((prev) =>
          prev.map((l) =>
            l.productId === item.id ? { ...l, quantityOnHand: item.quantityOnHand } : l
          )
        );
      }
      setLastAdded(null);
      setError(
        `Sin más stock: ${item.name} — ya tienes en el carrito ${item.quantityOnHand} ${
          item.quantityOnHand === 1 ? "unidad disponible" : "unidades disponibles"
        }.`
      );
      pistolInputRef.current?.focus();
      return false;
    }
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === item.id);
      if (existing) {
        const nextQty =
          isEntry ? existing.quantity + 1 : Math.min(existing.quantity + 1, item.quantityOnHand);
        const updated: CartLine = {
          ...existing,
          quantity: nextQty,
          quantityOnHand: item.quantityOnHand,
          suggestedSalePrice: item.baseSalePrice,
          unitSalePrice: Math.max(existing.unitSalePrice, item.baseSalePrice),
        };
        return [updated, ...prev.filter((l) => l.productId !== item.id)];
      }
      return [catalogToCartLine(item), ...prev];
    });
    setLastAdded(item.name);
    setCartOpen(true);
    pistolInputRef.current?.focus({ preventScroll: true });
    return true;
  }

  async function processPistolScan(raw: string) {
    if (hidePistol) return;
    const code = raw.trim();
    if (code.length < MIN_SCAN_LENGTH) return;
    if (pistolBusyRef.current) return;
    pistolBusyRef.current = true;
    if (pistolDebounceRef.current) {
      window.clearTimeout(pistolDebounceRef.current);
      pistolDebounceRef.current = null;
    }
    pistolValueRef.current = "";
    setPistolCode("");
    try {
      const item = await resolveScan(code);
      if (verifyMode) {
        handleVerifyScan(item);
      } else {
        addToCart(item, { fromScan: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Producto no encontrado");
    } finally {
      pistolBusyRef.current = false;
      pistolInputRef.current?.focus({ preventScroll: true });
    }
  }
  processPistolScanRef.current = (raw) => {
    void processPistolScan(raw);
  };

  function onPistolChange(value: string) {
    pistolValueRef.current = value;
    setPistolCode(value);
    if (pistolDebounceRef.current) window.clearTimeout(pistolDebounceRef.current);
    pistolDebounceRef.current = window.setTimeout(() => {
      pistolDebounceRef.current = null;
      void processPistolScan(pistolValueRef.current);
    }, PISTOL_DEBOUNCE_MS);
  }

  function onPistolKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (pistolDebounceRef.current) {
      window.clearTimeout(pistolDebounceRef.current);
      pistolDebounceRef.current = null;
    }
    // Leer del DOM/ref: al pegar + Enter el state de React aún puede estar vacío.
    const fromDom = e.currentTarget.value;
    void processPistolScan(fromDom || pistolValueRef.current);
  }

  function setQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const max = isEntry ? quantity : Math.min(quantity, l.quantityOnHand);
        return { ...l, quantity: Math.max(1, max) };
      })
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function setUnitSalePrice(productId: string, unitSalePrice: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, unitSalePrice: Math.round(unitSalePrice) } : l
      )
    );
  }

  function openExitCheckout() {
    const invalid = cart.find((l) => !isUnitSalePriceValid(l.unitSalePrice, l.suggestedSalePrice));
    if (invalid) {
      setError(
        `«${invalid.name}»: mínimo ${formatMoney(invalid.suggestedSalePrice)} / ud por unidad.`
      );
      return;
    }
    setError(null);
    setShowExitCheckout(true);
  }

  async function onConfirmEntry() {
    if (!token || !warehouseId || cart.length === 0) return;
    if (entryType === "production_order" && !isFactory) {
      setError("La orden de producción solo se puede registrar en una fábrica.");
      setShowConfirm(false);
      return;
    }
    const linked =
      entryType === "transfer" ||
      entryType === "distribution" ||
      entryType === "return_to_factory";
    if (linked && !originInvoiceNumber.trim()) {
      setError("Indica el código del movimiento de origen.");
      setShowConfirm(false);
      return;
    }
    if (linked && !allVerified) {
      setError("Debes verificar con la pistola todas las unidades antes de confirmar.");
      setShowConfirm(false);
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const { item } = await confirmMovement(token, warehouseId, {
        docType: "entry",
        lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        notes: notes.trim() || null,
        entryType,
        originInvoiceNumber: linked ? originInvoiceNumber.trim().toUpperCase().replace(/\s+/g, "") : null,
      });
      setCart([]);
      setNotes("");
      setOriginInvoiceNumber("");
      setScannedByProduct({});
      setShowConfirm(false);
      setCartOpen(false);
      clearPosDraft(mode, warehouseId);
      clearScanCache(warehouseId);
      applyLocalStockDelta(
        cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        "entry"
      );
      void loadProducts({ silent: true });
      if (entryType === "production_order") {
        navigate("/app/inventario/entradas/historial", {
          replace: true,
          state: {
            flash: `Orden de producción ${item.productionOrderCode ?? item.invoiceNumber ?? ""} registrada. Imprime las etiquetas desde la card.`,
          },
        });
        return;
      }
      if (entryType === "purchase") {
        navigate("/app/inventario/entradas/historial", {
          replace: true,
          state: {
            flash: `Entrada por compra ${item.purchaseOrderCode ?? item.invoiceNumber ?? ""} registrada. Imprime las etiquetas desde la card.`,
          },
        });
        return;
      }
      setSuccess("Entrada registrada correctamente.");
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      const wrongTypeMsg =
        entryType === "distribution"
          ? "El código debe ser una salida de tipo Distribución."
          : entryType === "transfer"
            ? "El código debe ser una salida de tipo Traslado."
            : entryType === "return_to_factory"
              ? "El código debe ser una salida de tipo Devolución a Fábrica."
              : "El código no corresponde al tipo de ingreso seleccionado.";
      const friendly: Record<string, string> = {
        insufficient_stock: "Stock insuficiente en uno o más productos.",
        origin_invoice_required: "Indica el código del movimiento de origen.",
        origin_invoice_not_found: "No se encontró ese código de movimiento.",
        origin_invoice_wrong_type: wrongTypeMsg,
        origin_invoice_wrong_destination:
          "Este código no está destinado a la sede activa. Solo se puede usar en la sede de destino.",
        origin_invoice_already_received: "Ese código ya fue recibido. Solo se puede usar una vez.",
        production_order_requires_factory: "La orden de producción solo se puede registrar en una fábrica.",
      };
      setError(friendly[msg] ?? msg);
      setShowConfirm(false);
    } finally {
      setConfirming(false);
    }
  }

  async function onConfirmExit(data: ExitCheckoutData) {
    if (!token || !warehouseId || cart.length === 0) return;
    const internal =
      data.exitKind === "distribution" ||
      data.exitKind === "transfer" ||
      data.exitKind === "return_to_factory";
    if (
      !internal &&
      cart.some((l) => !l.isReturn && !isUnitSalePriceValid(l.unitSalePrice, l.suggestedSalePrice))
    ) {
      setError("Corrige los valores por unidad antes de confirmar la salida.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const { item } = await confirmExit(token, warehouseId, {
        exitKind: data.exitKind,
        lines: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitSalePrice: l.unitSalePrice,
          isReturn: l.isReturn || false,
        })),
        notes: data.notes || null,
        customerName: data.customerName || null,
        relatedInvoiceNumber: data.relatedInvoiceNumber || null,
        customerId: data.customerId || null,
        paymentMethod: data.paymentMethod || null,
        paymentBreakdown: data.paymentBreakdown || null,
        destinationWarehouseId: data.destinationWarehouseId || null,
        layawayId: data.layawayId || null,
        receiptUrl: data.receiptUrl || null,
        receiptUrls: data.receiptUrls || null,
        receiptFilename: data.receiptFilename || null,
        discountAmount: data.discountAmount || 0,
        discountReason: data.discountReason || null,
      });
      setCart([]);
      setNotes("");
      setShowExitCheckout(false);
      setCartOpen(false);
      setInvoiceDoc(item);
      clearPosDraft(mode, warehouseId);
      clearCheckoutDraft(warehouseId);
      clearScanCache(warehouseId);
      if (data.destinationWarehouseId) {
        clearScanCache(data.destinationWarehouseId);
      }
      applyLocalStockDelta(
        cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          isReturn: l.isReturn,
        })),
        "exit"
      );
      void loadProducts({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg === "insufficient_stock") {
        setError("Stock insuficiente en uno o más productos.");
        clearScanCache(warehouseId);
        void loadProducts({ silent: true });
        void refreshCartStock();
      } else if (msg === "customer_name_required") {
        setError("Indica el nombre del cliente o selecciona uno para la venta.");
      } else if (msg === "payment_total_mismatch" || msg === "invalid_payment_breakdown") {
        setError("La suma de los métodos de pago debe ser igual al total de la venta.");
      } else if (msg === "related_invoice_required") {
        setError("Indica el número de factura de la salida original (cambios / garantías).");
      } else if (msg === "sale_price_below_suggested") {
        setError("El valor de salida no puede ser menor al precio sugerido del catálogo.");
      } else if (msg === "destination_warehouse_required") {
        setError("Debes seleccionar una sede de destino.");
      } else if (msg === "destination_warehouse_not_found") {
        setError("La sede de destino no existe o está inactiva.");
      } else if (msg === "destination_same_as_origin") {
        setError("La sede de destino no puede ser la misma sede de origen.");
      } else if (msg === "internal_error") {
        setError("Ocurrió un error en el servidor al generar el comprobante. Intenta de nuevo.");
      } else if (msg === "distribution_requires_factory") {
        setError("La distribución solo se puede hacer desde una fábrica.");
      } else if (msg === "return_destination_must_be_factory") {
        setError("La devolución a fábrica debe ir a una sede marcada como fábrica.");
      } else if (msg === "exchange_lines_required") {
        setError("En un cambio debes incluir producto(s) de salida y de retorno.");
      } else if (msg === "exchange_net_value_required") {
        setError("El valor neto del cambio no puede ser $0.");
      } else if (msg === "layaway_not_found") {
        setError("El apartado seleccionado no fue encontrado.");
      } else if (msg === "layaway_not_active") {
        setError("El apartado seleccionado ya no se encuentra activo.");
      } else {
        setError(msg);
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className={`inv-page inv-pos inv-pos--${mode}`}>
      <InventoryPageHeader
        backTo="/app/inventario"
        title={
          <>
            <Icon size={24} strokeWidth={2} aria-hidden />
            {title}
          </>
        }
        description={
          isEntry
            ? isProductionOrder
              ? `Agrega productos al listado · ${sessionLabel}`
              : isPurchase
                ? `Ingreso de compra a proveedores (etiquetas) · ${sessionLabel}`
                : isInvoiceLinkedEntry
                  ? `Código corto + verificación con pistola · ${sessionLabel}`
                  : `Elige el tipo de ingreso · ${sessionLabel}`
            : "Punto de venta · pistolea o toca productos"
        }
        actions={
          <Link
            to={isEntry ? "/app/inventario/entradas/historial" : "/app/inventario/salidas/historial"}
            className="inv-btn inv-btn--ghost"
          >
            {isEntry ? "Listado de entradas" : "Listado de ventas"}
          </Link>
        }
      />
      {isEntry ? (
        <div className="inv-pos-config">
          <div className="inv-pos-config__grid">
            <label className="inv-pos-config__label">
              <span>Tipo de ingreso *</span>
              <select
                value={entryType}
                onChange={(e) => {
                  const next = e.target.value as typeof entryType;
                  setEntryType(next);
                  setOriginInvoiceNumber("");
                  setPreloadError(null);
                  setCart([]);
                  setScannedByProduct({});
                  setPistolCode("");
                }}
              >
                <option value="distribution">Entrada (distribución)</option>
                <option value="transfer">Traslado desde otra sede</option>
                <option value="return_to_factory">Devolución a Fábrica (recepción)</option>
                <option value="purchase">Entrada por compra (etiquetas)</option>
                {isFactory ? (
                  <option value="production_order">Orden de producción (etiquetas)</option>
                ) : null}
              </select>
            </label>

            {(entryType === "transfer" ||
              entryType === "distribution" ||
              entryType === "return_to_factory") && (
              <div className="inv-pos-config__invoice">
                <label className="inv-pos-config__label">
                  <span>Código de movimiento *</span>
                  <div className="inv-pos-config__invoice-row">
                    <input
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Ej: LC40-15"
                      value={originInvoiceNumber}
                      onChange={(e) => setOriginInvoiceNumber(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handlePreload();
                        }
                      }}
                      className="inv-pos-config__invoice-input"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePreload()}
                      disabled={preloading || !originInvoiceNumber.trim()}
                      className="inv-btn inv-btn--primary inv-pos-config__invoice-btn"
                    >
                      {preloading ? "Buscando…" : "Precargar"}
                    </button>
                  </div>
                </label>
              </div>
            )}
          </div>

          {entryType === "production_order" ? (
            <p className="inv-pos-config__hint">
              Puedes agregar cualquier producto. Al confirmar la OP, las etiquetas/QR se generan solo para los que tienen código de barras configurado.
            </p>
          ) : null}

          {entryType === "purchase" ? (
            <p className="inv-pos-config__hint">
              Entrada directa por compra (bodega y todas las sedes). No necesitas pistolear: toca o busca los productos en el catálogo y define las cantidades. Al confirmar, podrás imprimir las etiquetas adhesivas para pegárselas a los productos.
            </p>
          ) : null}

          {entryType === "distribution" ? (
            <p className="inv-pos-config__hint">
              Solo códigos de salida tipo <strong>Distribución</strong>. Válido una sola vez y solo en esta sede de destino.
            </p>
          ) : null}

          {entryType === "transfer" ? (
            <p className="inv-pos-config__hint">
              Solo códigos de salida tipo <strong>Traslado</strong>. Válido una sola vez y solo en esta sede de destino.
            </p>
          ) : null}

          {entryType === "return_to_factory" ? (
            <p className="inv-pos-config__hint">
              Solo códigos de salida tipo <strong>Devolución a Fábrica</strong>. Válido una sola vez y solo en esta sede (fábrica).
            </p>
          ) : null}

          {(entryType === "transfer" ||
            entryType === "distribution" ||
            entryType === "return_to_factory") && (
            <>
              <span className="inv-pos-config__note">
                Código corto: sede + número (como en el comprobante). Una sola recepción por código.
              </span>
              {preloadError ? (
                <span className="inv-pos-config__error">{preloadError}</span>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!isEntry ? (
        <div className="inv-pos-sellbar">
          <label className="inv-pos-sellbar__kind">
            <span>Tipo</span>
            <select
              value={exitKind}
              onChange={(e) => {
                setExitKind(e.target.value as ExitKind);
                setError(null);
              }}
              aria-label="Tipo de salida"
            >
              {allowedExitKinds.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {!hidePistol ? (
            <>
              <div className="inv-pistol-status inv-pistol-status--inline" role="status">
                <ScanLine size={16} strokeWidth={2} aria-hidden />
                <span className="inv-pistol-status__hint">Listo para escanear</span>
                <input
                  id="inv-pistol-input"
                  ref={pistolInputRef}
                  type="text"
                  className="inv-pistol-trap"
                  value={pistolCode}
                  tabIndex={-1}
                  onChange={(e) => onPistolChange(e.target.value)}
                  onKeyDown={onPistolKeyDown}
                  aria-label="Receptor de pistola de código de barras"
                  inputMode="none"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="button"
                className="inv-btn inv-btn--ghost inv-pos-camera-btn"
                onClick={() => setCameraOpen(true)}
                title="Escanear código con la cámara del celular"
              >
                <Camera size={16} strokeWidth={2} aria-hidden />
                <span>Cámara</span>
              </button>
            </>
          ) : null}
          <span className="inv-pos-sellbar__sede" title={sessionLabel}>
            {sessionLabel}
          </span>
        </div>
      ) : null}

      {isEntry && !hidePistol ? (
        <div className="inv-pistol-status" role="status">
          <ScanLine size={16} strokeWidth={2} aria-hidden />
          <span className="inv-pistol-status__hint">
            {verifyMode ? "Listo para verificar" : "Listo para escanear"}
          </span>
          <input
            id="inv-pistol-input"
            ref={pistolInputRef}
            type="text"
            className="inv-pistol-trap"
            value={pistolCode}
            tabIndex={-1}
            onChange={(e) => onPistolChange(e.target.value)}
            onKeyDown={onPistolKeyDown}
            aria-label="Receptor de pistola de código de barras"
            inputMode="none"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-pos-camera-btn"
            onClick={() => setCameraOpen(true)}
            title="Escanear código con la cámara del celular"
          >
            <Camera size={16} strokeWidth={2} aria-hidden />
            <span>Cámara</span>
          </button>
        </div>
      ) : null}

      {lastAdded ? (
        <p className="inv-scan-flash" role="status" aria-live="polite">
          <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden />
          <span>
            Agregado: <strong>{lastAdded}</strong>
          </span>
        </p>
      ) : null}
      {verifyFlash ? (
        <p className="inv-scan-flash" role="status" aria-live="polite">
          <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden />
          <span>
            Verificado: <strong>{verifyFlash}</strong>
          </span>
        </p>
      ) : null}
      {success ? (
        <p className="inv-success" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <div className="inv-pos-alert" role="alert">
          <div className="inv-pos-alert__icon" aria-hidden>
            <TriangleAlert size={20} strokeWidth={2.25} />
          </div>
          <div className="inv-pos-alert__body">
            <strong className="inv-pos-alert__title">
              {error.startsWith("Sin más stock")
                ? "Sin más stock"
                : error.startsWith("Sin stock")
                  ? "Sin stock"
                  : error.startsWith("Producto no encontrado")
                    ? "Producto no encontrado"
                    : "No se pudo agregar"}
            </strong>
            <p className="inv-pos-alert__text">
              {error.startsWith("Sin más stock: ")
                ? error.slice("Sin más stock: ".length)
                : error.startsWith("Sin stock: ")
                  ? error.slice("Sin stock: ".length)
                  : error}
            </p>
          </div>
          <button
            type="button"
            className="inv-pos-alert__close"
            aria-label="Cerrar alerta"
            onClick={() => setError(null)}
          >
            <X size={16} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="inv-pos__layout">
        <section className="inv-pos__catalog" aria-label="Productos">
          {hideCatalogPicker ? (
            cart.length === 0 ? (
              <div className="inv-pos-verify__empty">
                <strong>
                  Productos solo desde el código de movimiento
                </strong>
                Ingresa el código arriba y pulsa <strong>Precargar</strong>. Luego verifica con la
                pistola cada unidad que llega: solo podrás confirmar cuando todo esté completo.
              </div>
            ) : (
              <div className="inv-pos-verify">
                <div className="inv-pos-verify__head">
                  <strong className="inv-pos-verify__title">
                    Verificación de recepción
                  </strong>
                  <span className={`inv-pos-verify__count${allVerified ? " is-complete" : ""}`}>
                    {verifiedTotal} / {expectedTotal} unidades
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={expectedTotal}
                  aria-valuenow={verifiedTotal}
                  className="inv-pos-verify__bar"
                >
                  <div
                    className={`inv-pos-verify__bar-fill${allVerified ? " is-complete" : ""}`}
                    style={{
                      width: `${expectedTotal > 0 ? Math.round((verifiedTotal / expectedTotal) * 100) : 0}%`,
                    }}
                  />
                </div>

                <ul className="inv-pos-verify__list">
                  {cart.map((line) => {
                    const got = Math.min(scannedByProduct[line.productId] ?? 0, line.quantity);
                    const complete = got >= line.quantity;
                    const img = resolveLightMediaUrl(line.imageUrl, "xs");
                    return (
                      <li
                        key={line.productId}
                        className={`inv-pos-verify__item${complete ? " is-complete" : ""}`}
                      >
                        <span aria-hidden className={`inv-pos-verify__status${complete ? " is-complete" : ""}`}>
                          {complete ? <CheckCircle2 size={26} strokeWidth={2.25} /> : <ScanLine size={24} strokeWidth={2} />}
                        </span>
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            width={40}
                            height={40}
                            loading="lazy"
                            decoding="async"
                            className="inv-pos-verify__thumb"
                          />
                        ) : (
                          <span className="inv-pos-verify__thumb inv-pos-verify__thumb--ph">
                            <Package size={20} strokeWidth={1.5} aria-hidden />
                          </span>
                        )}
                        <div className="inv-pos-verify__info">
                          <strong>
                            {line.name}
                          </strong>
                          <span>{line.referenceCode}</span>
                          {!line.barcode ? (
                            <span className="inv-pos-verify__manual-tag">
                              Sin código · ingreso manual
                            </span>
                          ) : null}
                        </div>
                        <div className="inv-pos-verify__controls">
                          <button
                            type="button"
                            className="inv-btn inv-btn--ghost inv-pos-verify__btn"
                            aria-label={`Quitar una unidad verificada de ${line.name}`}
                            disabled={got === 0}
                            onClick={() => bumpVerified(line.productId, -1)}
                          >
                            <Minus size={16} strokeWidth={2.5} aria-hidden />
                          </button>
                          {line.barcode ? (
                            <span className={`inv-pos-verify__qty${complete ? " is-complete" : ""}`}>
                              {got} / {line.quantity}
                            </span>
                          ) : (
                            <>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={line.quantity}
                                value={got}
                                onChange={(e) => setVerifiedQuantity(line.productId, Number(e.target.value))}
                                aria-label={`Cantidad recibida manualmente de ${line.name}`}
                                className={`inv-pos-verify__qty-input${complete ? " is-complete" : ""}`}
                              />
                              <span className="inv-pos-verify__qty-max">
                                / {line.quantity}
                              </span>
                              <button
                                type="button"
                                className="inv-btn inv-btn--ghost inv-pos-verify__btn"
                                aria-label={`Marcar una unidad recibida de ${line.name}`}
                                disabled={complete}
                                onClick={() => bumpVerified(line.productId, 1)}
                              >
                                <Plus size={16} strokeWidth={2.5} aria-hidden />
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {allVerified ? (
                  <p className="inv-success inv-pos-verify__done" role="status">
                    Todo verificado. Ya puedes confirmar la entrada.
                  </p>
                ) : (
                  <p className="inv-pos-verify__hint">
                    Escanea los productos con código. Los productos sin código se registran manualmente
                    escribiendo la cantidad recibida o usando +/−.
                  </p>
                )}
              </div>
            )
          ) : (
            <>
          <label className="inv-pos__catalog-search">
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              type="search"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder={
                isEntry
                  ? entryType === "production_order"
                    ? "Buscar productos para la orden…"
                    : entryType === "purchase"
                      ? "Buscar productos de la compra…"
                      : "Filtrar productos por nombre o referencia…"
                  : "Buscar productos sin código de barras…"
              }
              aria-label="Filtrar listado de productos"
            />
          </label>
          {loading ? (
            <p className="inv-page__desc">Cargando…</p>
          ) : (
            <div className="inv-pos__picker">
              {visibleProducts.map((item) => {
                const pickImg = resolveLightMediaUrl(item.imageUrl, "sm");
                const pickImgLg = resolveMediaUrl(item.imageUrlLg ?? item.imageUrl);
                const inCart = cartQtyByProduct.get(item.id) ?? 0;
                return (
                <button
                  key={item.id}
                  type="button"
                  className={`inv-pos__pick${inCart > 0 ? " inv-pos__pick--in-cart" : ""}${!isEntry ? " inv-pos__pick--exit" : ""}`}
                  onClick={() => addToCart(item)}
                  disabled={!isEntry && item.quantityOnHand <= 0}
                >
                  {inCart > 0 ? (
                    <span className="inv-pos__pick-qty" aria-label={`${inCart} en carrito`}>
                      {inCart}
                    </span>
                  ) : null}
                  {pickImg ? (
                    <span className="inv-pos__pick-media inv-pos__pick-media--expand">
                      <img src={pickImg} alt="" loading="lazy" decoding="async" />
                      <span
                        role="button"
                        tabIndex={0}
                        className="inv-pos__pick-media-zoom"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pickImgLg) setExpandedPhoto({ url: pickImgLg, name: item.name });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (pickImgLg) setExpandedPhoto({ url: pickImgLg, name: item.name });
                          }
                        }}
                        aria-label={`Ver imagen completa de ${item.name}`}
                        title="Ampliar foto"
                      >
                        <ZoomIn size={14} strokeWidth={2.5} />
                      </span>
                    </span>
                  ) : (
                    <span className="inv-pos__pick-media">
                      <Package size={22} strokeWidth={1.5} aria-hidden />
                    </span>
                  )}
                  <span className="inv-pos__pick-name" title={item.name}>
                    {item.name}
                  </span>
                  {isEntry ? (
                    <span className="inv-pos__pick-stock inv-pos__pick-stock--entry">+ agregar</span>
                  ) : (
                    <div className="inv-pos__pick-meta inv-pos__pick-meta--shop">
                      <span className="inv-pos__pick-price">{formatMoney(item.baseSalePrice)}</span>
                      <span
                        className={`inv-pos__pick-stock-pill inv-pos__pick-stock-pill--${
                          item.quantityOnHand <= 0
                            ? "out"
                            : item.stockSignal === "low" || item.stockSignal === "critical"
                              ? "low"
                              : "ok"
                        }`}
                      >
                        {item.quantityOnHand <= 0
                          ? "Agotado"
                          : `${item.quantityOnHand} disp.`}
                      </span>
                    </div>
                  )}
                </button>
              );
              })}
            </div>
          )}
            </>
          )}
        </section>

        {cartOpen ? (
          <div
            className="inv-pos__cart-backdrop"
            onClick={() => setCartOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <aside className={`inv-pos__cart-panel${cartOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="inv-pos__cart-toggle"
            aria-expanded={cartOpen}
            onClick={() => setCartOpen((o) => !o)}
          >
            <ShoppingCart size={18} strokeWidth={2} aria-hidden />
            <span className="inv-pos__cart-toggle-text">
              Carrito
              <span className="inv-pos__cart-toggle-badge">{cartTotalUnits}</span>
            </span>
            {!isEntry && !isInternalExit && cart.length > 0 ? (
              <span className="inv-pos__cart-toggle-total">{formatMoney(cartTotalValue)}</span>
            ) : null}
            {cartOpen ? (
              <ChevronDown size={18} strokeWidth={2} aria-hidden />
            ) : (
              <ChevronUp size={18} strokeWidth={2} aria-hidden />
            )}
          </button>
          <div className="inv-pos__cart-body">
            <VisualCart
              lines={cart}
              mode={mode}
              onQtyChange={isInvoiceLinkedEntry ? undefined : setQty}
              onRemove={isInvoiceLinkedEntry ? undefined : removeLine}
              onUnitSalePriceChange={isEntry || isInternalExit ? undefined : setUnitSalePrice}
              locked={isInvoiceLinkedEntry}
              showValues={!isInternalExit}
            />
            {isEntry ? (
              <label className="field inv-pos__notes">
                <span>Notas (opcional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referencia, proveedor…" />
              </label>
            ) : null}
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--primary inv-pos__confirm"
            disabled={cart.length === 0 || (isInvoiceLinkedEntry && !allVerified)}
            title={
              isInvoiceLinkedEntry && cart.length > 0 && !allVerified
                ? "Verifica todas las unidades con la pistola antes de confirmar"
                : undefined
            }
            onClick={() => (isEntry ? setShowConfirm(true) : openExitCheckout())}
          >
            <Check size={18} strokeWidth={2} aria-hidden />
            {isEntry
              ? isInvoiceLinkedEntry && cart.length > 0 && !allVerified
                ? `Faltan ${expectedTotal - verifiedTotal} por verificar`
                : "Confirmar entrada"
              : isInternalExit
                ? "Finalizar salida"
                : cart.length === 0
                  ? "Cobrar venta"
                  : `Cobrar · ${formatMoney(cartTotalValue)}`}
          </button>
        </aside>
      </div>

      {expandedPhoto ? (
        <div
          className="inv-photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen de ${expandedPhoto.name}`}
          onClick={() => setExpandedPhoto(null)}
        >
          <div
            className="inv-photo-lightbox__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="inv-photo-lightbox__close"
              onClick={() => setExpandedPhoto(null)}
              aria-label="Cerrar imagen"
            >
              <X size={22} strokeWidth={2} aria-hidden />
            </button>
            <img
              className="inv-photo-lightbox__img"
              src={expandedPhoto.url}
              alt={expandedPhoto.name}
            />
            <p className="inv-photo-lightbox__caption">{expandedPhoto.name}</p>
          </div>
        </div>
      ) : null}

      {showConfirm && isEntry ? (
        <div className="inv-modal-backdrop" role="presentation" onClick={() => !confirming && setShowConfirm(false)}>
          <div
            className="inv-modal"
            role="dialog"
            aria-labelledby="inv-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="inv-confirm-title">¿Confirmar entrada?</h2>
            <p>
              {cart.length} producto(s) · {cart.reduce((s, l) => s + l.quantity, 0)} unidades
            </p>
            <div className="inv-modal__actions">
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                disabled={confirming}
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inv-btn inv-btn--primary"
                disabled={confirming}
                onClick={() => void onConfirmEntry()}
              >
                {confirming ? "Procesando…" : "Sí, confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showExitCheckout && !isEntry ? (
        <ExitCheckoutModal
          open={showExitCheckout}
          lockedKind={exitKind}
          totalUnits={cart.reduce((s, l) => s + l.quantity, 0)}
          totalValue={cartTotalValue}
          confirming={confirming}
          onClose={() => {
            if (!confirming) {
              if (warehouseId) clearCheckoutDraft(warehouseId);
              setShowExitCheckout(false);
            }
          }}
          onConfirm={(data) => void onConfirmExit(data)}
          isFactory={isFactory}
          serverError={error}
          exchangeReady={{
            hasOutbound: cart.some((l) => !l.isReturn),
            hasReturn: cart.some((l) => Boolean(l.isReturn)),
            netValue: cartTotalValue,
          }}
        />
      ) : null}

      {cameraOpen ? (
        <Suspense fallback={null}>
          <BarcodeScannerModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onDetected={(code) => processPistolScanRef.current(code)}
          />
        </Suspense>
      ) : null}

      {invoiceDoc ? (
        <DocumentInvoicePrint document={invoiceDoc} onClose={() => setInvoiceDoc(null)} />
      ) : null}
    </div>
  );
}
