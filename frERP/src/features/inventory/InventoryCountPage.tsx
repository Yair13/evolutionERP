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
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  Store,
  X,
} from "lucide-react";
import {
  cancelInventoryCount,
  confirmInventoryCount,
  fetchOpenInventoryCount,
  openInventoryCount,
  resetInventoryCountCounted,
  updateInventoryCountLine,
} from "../../api/inventory.js";
const BarcodeScannerModal = lazy(() =>
  import("../../components/inventory/BarcodeScannerModal.js").then((m) => ({
    default: m.BarcodeScannerModal,
  }))
);
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { InvScopeBar } from "../../components/inventory/InvScopeBar.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { useResolveScan } from "../../hooks/useResolveScan.js";
import { resolveLightMediaUrl } from "../../lib/mediaUrl.js";
import { clearScanCache } from "../../lib/scanCache.js";
import type { ScanMatchable } from "../../lib/scanMatch.js";
import type {
  CountKind,
  InventoryCountDetail,
  InventoryCountLine,
} from "./inventory.types.js";

const MIN_SCAN_LENGTH = 2;

type LineFilter = "all" | "pending" | "short" | "over" | "matched";

function lineStatus(line: InventoryCountLine): "pending" | "short" | "over" | "matched" | "idle" {
  if (line.countedQuantity === 0 && line.expectedQuantity > 0) return "pending";
  if (line.countedQuantity === 0 && line.expectedQuantity === 0) return "idle";
  if (line.countedQuantity < line.expectedQuantity) return "short";
  if (line.countedQuantity > line.expectedQuantity) return "over";
  return "matched";
}

function progressPct(counted: number, expected: number): number {
  if (expected <= 0) return counted > 0 ? 100 : 0;
  return Math.min(100, Math.round((counted / expected) * 100));
}

function countErrorMessage(code: string): string {
  switch (code) {
    case "count_already_open":
      return "Ya hay un conteo/cierre abierto en esta sede.";
    case "no_active_products":
      return "No hay productos activos en el catálogo para inventariar.";
    case "count_not_open":
      return "El conteo ya no está abierto.";
    case "count_not_found":
      return "Conteo no encontrado.";
    case "product_not_found":
      return "Producto no encontrado.";
    case "warehouse_id_required":
      return "Selecciona una sede para continuar.";
    case "initial_count_requires_admin":
      return "El inventario inicial solo lo puede realizar la Sede Administrativa.";
    default:
      return code || "Error";
  }
}

type InventoryCountPageProps = {
  /**
   * "initial" = Inventario inicial por sedes (exclusivo de Sede Administrativa).
   * "audit"   = Cierre / descuadre operativo de la sede activa.
   */
  mode?: CountKind;
};

type LineQtyInputProps = {
  value: number;
  disabled?: boolean;
  onChange: (qty: number) => void;
  productName: string;
};

function LineQtyInput({ value, disabled, onChange, productName }: LineQtyInputProps) {
  const [localVal, setLocalVal] = useState(String(value));
  const committedRef = useRef(value);

  useEffect(() => {
    setLocalVal(String(value));
    committedRef.current = value;
  }, [value]);

  const commit = useCallback(
    (rawVal: string) => {
      const num = Math.max(0, Math.round(Number(rawVal) || 0));
      if (num !== committedRef.current) {
        committedRef.current = num;
        onChange(num);
      }
      setLocalVal(String(num));
    },
    [onChange]
  );

  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={localVal}
      disabled={disabled}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
      aria-label={`Cantidad contada de ${productName}`}
      className="inv-count-line__qty-input"
    />
  );
}

export function InventoryCountPage({ mode }: InventoryCountPageProps) {
  const { token, user } = useAuth();
  const { warehouseId, setWarehouseId, isAllWarehouses, canViewAllWarehouses, warehouses } =
    useWarehouse();

  const effectiveMode: CountKind = mode ?? (isAllWarehouses ? "initial" : "audit");
  const isInitialMode = effectiveMode === "initial";

  /** En Sede Administrativa (inventario inicial), la sede se elige localmente por sede. */
  const [targetWarehouseId, setTargetWarehouseId] = useState<string | null>(null);

  const [count, setCount] = useState<InventoryCountDetail | null>(null);
  const isInitial = isInitialMode || count?.countKind === "initial";
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [flashProductId, setFlashProductId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LineFilter>("all");
  const [query, setQuery] = useState("");
  const [pistolCode, setPistolCode] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const pistolInputRef = useRef<HTMLInputElement>(null);
  const pistolDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pistolBusyRef = useRef(false);
  const pistolValueRef = useRef("");

  useEffect(() => {
    if (canViewAllWarehouses) return;
    const assigned = user?.warehouseIds;
    if (!assigned || assigned.length !== 1) return;
    const only = assigned[0];
    if (only && only !== warehouseId && warehouses.some((w) => w.id === only)) {
      setWarehouseId(only);
    }
  }, [user?.warehouseIds, warehouseId, warehouses, setWarehouseId, canViewAllWarehouses]);

  // Si en modo inicial solo existe una sede activa, preseleccionarla
  useEffect(() => {
    if (!isInitialMode) return;
    if (targetWarehouseId && warehouses.some((w) => w.id === targetWarehouseId)) return;
    if (warehouses.length === 1) {
      setTargetWarehouseId(warehouses[0]!.id);
    }
  }, [isInitialMode, targetWarehouseId, warehouses]);

  const activeWarehouseId = isInitialMode ? targetWarehouseId : warehouseId;
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === activeWarehouseId) ?? null,
    [warehouses, activeWarehouseId]
  );
  const needsWarehouse = isInitialMode ? !activeWarehouseId : isAllWarehouses || !activeWarehouseId;

  const loadOpen = useCallback(async () => {
    if (!token || !activeWarehouseId || (!isInitialMode && isAllWarehouses)) {
      setCount(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { item } = await fetchOpenInventoryCount(token, activeWarehouseId);
      setCount(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "count_not_open") {
        setCount(null);
      } else {
        setError(countErrorMessage(msg));
        setCount(null);
      }
    } finally {
      setLoading(false);
    }
  }, [token, activeWarehouseId, isInitialMode, isAllWarehouses]);

  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  const getLocalScanItems = useCallback((): ScanMatchable[] => {
    if (!count) return [];
    return count.lines.map((l) => ({
      id: l.productId,
      name: l.productName,
      barcode: l.barcode,
      referenceCode: l.referenceCode,
      imageUrl: l.imageUrl,
      quantityOnHand: l.expectedQuantity,
    }));
  }, [count]);

  const resolveScan = useResolveScan(token, activeWarehouseId, {
    getLocalItems: getLocalScanItems,
  });

  const applyServerCount = useCallback((item: InventoryCountDetail) => {
    setCount(item);
  }, []);

  const bumpLine = useCallback(
    async (productId: string, delta: number) => {
      if (!token || !activeWarehouseId || !count || count.status !== "open") return;
      setError(null);
      // Optimistic local update for immediate UI feedback
      setCount((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) => {
            if (l.productId !== productId) return l;
            const countedQuantity = Math.max(0, l.countedQuantity + delta);
            return {
              ...l,
              countedQuantity,
              difference: countedQuantity - l.expectedQuantity,
            };
          }),
          countedTotal: Math.max(0, prev.countedTotal + delta),
        };
      });
      setFlashProductId(productId);
      window.setTimeout(() => setFlashProductId(null), 700);
      try {
        const { item } = await updateInventoryCountLine(token, activeWarehouseId, count.id, {
          productId,
          delta,
        });
        applyServerCount(item);
      } catch (err) {
        setError(countErrorMessage(err instanceof Error ? err.message : "Error"));
        void loadOpen();
      }
    },
    [token, activeWarehouseId, count, applyServerCount, loadOpen]
  );

  const setLineQty = useCallback(
    async (productId: string, countedQuantity: number) => {
      if (!token || !activeWarehouseId || !count || count.status !== "open") return;
      const qty = Math.max(0, Math.round(countedQuantity));
      setCount((prev) => {
        if (!prev) return prev;
        let deltaTotal = 0;
        const lines = prev.lines.map((l) => {
          if (l.productId !== productId) return l;
          deltaTotal = qty - l.countedQuantity;
          return { ...l, countedQuantity: qty, difference: qty - l.expectedQuantity };
        });
        return { ...prev, lines, countedTotal: prev.countedTotal + deltaTotal };
      });
      try {
        const { item } = await updateInventoryCountLine(token, activeWarehouseId, count.id, {
          productId,
          countedQuantity: qty,
        });
        applyServerCount(item);
      } catch (err) {
        setError(countErrorMessage(err instanceof Error ? err.message : "Error"));
        void loadOpen();
      }
    },
    [token, activeWarehouseId, count, applyServerCount, loadOpen]
  );

  const processScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (code.length < MIN_SCAN_LENGTH || pistolBusyRef.current) return;
      if (!count || count.status !== "open") return;
      pistolBusyRef.current = true;
      setError(null);
      try {
        const item = await resolveScan(code);
        await bumpLine(item.id, 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Código no reconocido");
      } finally {
        pistolBusyRef.current = false;
        setPistolCode("");
        pistolValueRef.current = "";
        if (document.activeElement === pistolInputRef.current) {
          pistolInputRef.current?.focus({ preventScroll: true });
        }
      }
    },
    [count, resolveScan, bumpLine]
  );

  const onPistolChange = (value: string) => {
    pistolValueRef.current = value;
    setPistolCode(value);
    if (pistolDebounceRef.current) clearTimeout(pistolDebounceRef.current);
    pistolDebounceRef.current = setTimeout(() => {
      const v = pistolValueRef.current.trim();
      if (v.length >= MIN_SCAN_LENGTH) void processScan(v);
    }, 90);
  };

  const onPistolKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (pistolDebounceRef.current) clearTimeout(pistolDebounceRef.current);
    const fromDom = e.currentTarget.value.trim() || pistolValueRef.current.trim();
    void processScan(fromDom);
  };

  const startCount = async (kind: CountKind) => {
    if (!token || !activeWarehouseId) return;
    setOpening(true);
    setError(null);
    setSuccess(null);
    try {
      const { item } = await openInventoryCount(token, activeWarehouseId, { countKind: kind });
      setCount(item);
      setSuccess(
        kind === "initial"
          ? `Inventario inicial abierto para ${selectedWarehouse?.name ?? "la sede"}. Pistolea o ingresa cantidades.`
          : "Cierre abierto. Compara sistema vs físico."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg === "count_already_open") {
        void loadOpen();
      }
      setError(countErrorMessage(msg));
    } finally {
      setOpening(false);
    }
  };

  const handleResetCounted = async () => {
    if (!token || !activeWarehouseId || !count) return;
    if (!window.confirm("¿Reiniciar todas las cantidades contadas a cero? El stock del sistema no cambia.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { item } = await resetInventoryCountCounted(token, activeWarehouseId, count.id);
      applyServerCount(item);
      setSuccess(
        count.countKind === "initial"
          ? "Inventario inicial reiniciado. Puedes ingresar cantidades manualmente o con pistola."
          : "Cierre reiniciado. Puedes volver a pistolear."
      );
    } catch (err) {
      setError(countErrorMessage(err instanceof Error ? err.message : "Error"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!token || !activeWarehouseId || !count) return;
    const label = count.countKind === "initial" ? "este inventario inicial" : "este cierre";
    if (!window.confirm(`¿Cancelar ${label}? No se aplicará ningún ajuste de stock.`)) return;
    setSaving(true);
    setError(null);
    try {
      await cancelInventoryCount(token, activeWarehouseId, count.id);
      setCount(null);
      setSuccess(count.countKind === "initial" ? "Inventario inicial cancelado." : "Cierre cancelado.");
    } catch (err) {
      setError(countErrorMessage(err instanceof Error ? err.message : "Error"));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!token || !activeWarehouseId || !count) return;
    setSaving(true);
    setError(null);
    try {
      const { item } = await confirmInventoryCount(token, activeWarehouseId, count.id, notes || undefined);
      clearScanCache(activeWarehouseId);
      const diffs = item.lines.filter((l) => l.difference !== 0).length;
      setCount(null);
      setConfirmOpen(false);
      setNotes("");
      setSuccess(
        diffs > 0
          ? item.countKind === "initial"
            ? `Inventario inicial aplicado en ${selectedWarehouse?.name ?? "la sede"}: ${diffs} referencia(s) actualizada(s).`
            : `Ajuste aplicado: ${diffs} referencia(s) con descuadre corregida(s).`
          : "Confirmado sin diferencias. Stock sin cambios."
      );
    } catch (err) {
      setError(countErrorMessage(err instanceof Error ? err.message : "Error"));
    } finally {
      setSaving(false);
    }
  };

  const filteredLines = useMemo(() => {
    if (!count) return [];
    const q = query.trim().toLowerCase();
    return count.lines.filter((l) => {
      const st = lineStatus(l);
      if (filter === "pending" && st !== "pending") return false;
      if (filter === "short" && st !== "short") return false;
      if (filter === "over" && st !== "over") return false;
      if (filter === "matched" && st !== "matched") return false;
      if (!q) return true;
      return (
        l.productName.toLowerCase().includes(q) ||
        l.referenceCode.toLowerCase().includes(q) ||
        (l.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [count, filter, query]);

  const liveStats = useMemo(() => {
    if (!count) {
      return {
        matched: 0,
        short: 0,
        over: 0,
        pending: 0,
        countedTotal: 0,
        expectedTotal: 0,
        mismatch: 0,
      };
    }
    let matched = 0;
    let short = 0;
    let over = 0;
    let pending = 0;
    let countedTotal = 0;
    let expectedTotal = 0;
    let mismatch = 0;
    for (const l of count.lines) {
      countedTotal += l.countedQuantity;
      expectedTotal += l.expectedQuantity;
      const st = lineStatus(l);
      if (st === "matched") matched += 1;
      else if (st === "short") short += 1;
      else if (st === "over") over += 1;
      else if (st === "pending") pending += 1;
      if (l.difference !== 0 && !(l.countedQuantity === 0 && l.expectedQuantity === 0)) {
        mismatch += 1;
      }
    }
    return { matched, short, over, pending, countedTotal, expectedTotal, mismatch };
  }, [count]);

  const overallPct =
    liveStats.expectedTotal > 0
      ? Math.min(100, Math.round((liveStats.countedTotal / liveStats.expectedTotal) * 100))
      : liveStats.countedTotal > 0
        ? 100
        : 0;

  return (
    <div className="inv-page inv-count">
      <InventoryPageHeader
        title={
          <>
            <ClipboardCheck size={28} strokeWidth={2} aria-hidden />
            {isInitialMode ? "Inventario inicial por sede" : "Cierre de inventario"}
          </>
        }
        description={
          isInitialMode
            ? "Exclusivo de Sede Administrativa. Elige la sede a inventariar y registra el conteo inicial sin salir de la administración general."
            : "Compara el stock del sistema con lo físico en esta sede. Cada referencia muestra su barra de progreso y el descuadre."
        }
        backTo={isInitialMode ? "/app" : "/app/inventario"}
        scope={
          isInitialMode ? (
            <InvScopeBar
              focus="stock"
              warehouseId={targetWarehouseId}
              onWarehouseChange={(id) => {
                setError(null);
                setSuccess(null);
                setTargetWarehouseId(id);
              }}
              requireSingleWarehouse
            />
          ) : (
            <InvScopeBar focus="stock" requireSingleWarehouse lockWarehouse />
          )
        }
        alerts={
          <>
            {error ? (
              <p className="inv-error" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="inv-success" role="status">
                {success}
              </p>
            ) : null}
          </>
        }
      />

      {needsWarehouse ? (
        isInitialMode ? (
          <div className="inv-count-start">
            {warehouses.length === 0 ? (
              <p className="inv-page__desc">
                No hay sedes operativas activas aún. Crea primero una sede en Sistema → Sedes.
              </p>
            ) : (
              warehouses.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="inv-count-start__card"
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    setTargetWarehouseId(w.id);
                  }}
                >
                  <strong style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {w.is_factory ? (
                      <Factory size={18} strokeWidth={2} aria-hidden />
                    ) : (
                      <Store size={18} strokeWidth={2} aria-hidden />
                    )}
                    {w.name}
                  </strong>
                  <span>
                    Código <code>{w.code}</code> ·{" "}
                    {w.is_factory ? "Fábrica" : "Punto de venta"} — Seleccionar esta sede para abrir o continuar su inventario inicial.
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <p className="inv-page__desc">Selecciona una sede operativa para abrir o continuar un cierre.</p>
        )
      ) : loading ? (
        <p className="inv-page__desc">Cargando…</p>
      ) : !count ? (
        <div className="inv-count-start">
          {isInitialMode ? (
            <button
              type="button"
              className="inv-count-start__card"
              disabled={opening}
              onClick={() => void startCount("initial")}
            >
              <strong>
                Abrir inventario inicial en {selectedWarehouse?.name ?? "la sede seleccionada"}
              </strong>
              <span>
                Ideal al arrancar o inicializar {selectedWarehouse?.name ?? "la sede"}. Congela el stock actual (normalmente en cero) y registras lo físico con pistola o manualmente. Al confirmar se ajusta el inventario de esa sede.
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="inv-count-start__card"
              disabled={opening}
              onClick={() => void startCount("audit")}
            >
              <strong>Cierre / descuadre</strong>
              <span>
                Compara lo que el sistema tiene vs lo que pistoleas en esta sede. Ves faltantes y sobrantes por referencia y aplicas el ajuste al cerrar.
              </span>
            </button>
          )}
        </div>
      ) : !isInitialMode && count.countKind === "initial" ? (
        <div className="inv-count-start">
          <div className="inv-count-start__card">
            <strong>Inventario inicial en curso ({count.invoiceNumber ?? "abierto"})</strong>
            <span>
              Esta sede tiene un inventario inicial abierto desde la Sede Administrativa. El inventario inicial solo puede gestionarse y confirmarse desde la Sede Administrativa.
            </span>
          </div>
        </div>
      ) : (
        <>
          <section className="inv-count-summary" aria-label="Resumen del cierre">
            <div className="inv-count-summary__top">
              <div>
                <p className="inv-count-summary__kind">
                  {count.countKind === "initial" ? "Inventario inicial" : "Cierre / descuadre"}
                  {selectedWarehouse ? ` · ${selectedWarehouse.name}` : ""}
                  {count.invoiceNumber ? ` · ${count.invoiceNumber}` : ""}
                </p>
                <p className="inv-count-summary__totals">
                  Contado <strong>{liveStats.countedTotal}</strong> / Sistema{" "}
                  <strong>{liveStats.expectedTotal}</strong>
                </p>
              </div>
              <div className="inv-count-summary__chips" role="list">
                <span className="inv-count-chip inv-count-chip--ok" role="listitem">
                  Cuadran {liveStats.matched}
                </span>
                <span className="inv-count-chip inv-count-chip--short" role="listitem">
                  Faltan {liveStats.short}
                </span>
                <span className="inv-count-chip inv-count-chip--over" role="listitem">
                  Sobran {liveStats.over}
                </span>
                <span className="inv-count-chip inv-count-chip--pending" role="listitem">
                  Pendientes {liveStats.pending}
                </span>
              </div>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallPct}
              aria-label="Progreso global del cierre"
              className="inv-count-summary__bar"
            >
              <div
                className={`inv-count-summary__bar-fill${liveStats.mismatch === 0 && liveStats.countedTotal > 0 ? " is-complete" : ""}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </section>

          <div className="inv-count-toolbar">
            <label className="inv-count-pistol">
              <ScanLine size={18} strokeWidth={2} aria-hidden />
              <input
                ref={pistolInputRef}
                type="text"
                inputMode="none"
                autoComplete="off"
                spellCheck={false}
                value={pistolCode}
                onChange={(e) => onPistolChange(e.target.value)}
                onKeyDown={onPistolKeyDown}
                placeholder={isInitial ? "Pistola / código (opcional)…" : "Pistola / código…"}
                aria-label="Escanear con pistola"
              />
            </label>
            <button
              type="button"
              className="inv-btn inv-btn--ghost inv-count-camera-btn"
              onClick={() => setCameraOpen(true)}
              title="Escanear código con la cámara del celular"
            >
              <Camera size={16} strokeWidth={2} aria-hidden />
              <span>Cámara</span>
            </button>
            <label className="inv-count-search">
              <Search size={16} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar referencia o nombre…"
                aria-label="Filtrar referencias"
              />
            </label>
          </div>

          <div className="inv-count-filters" role="tablist" aria-label="Filtrar líneas">
            {(
              [
                ["all", "Todas"],
                ["pending", "Pendientes"],
                ["short", "Faltantes"],
                ["over", "Sobrantes"],
                ["matched", "Cuadran"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={`inv-count-filters__btn${filter === key ? " is-active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="inv-count-list">
            {filteredLines.map((line) => {
              const st = lineStatus(line);
              const pct = progressPct(line.countedQuantity, line.expectedQuantity);
              const img = resolveLightMediaUrl(line.imageUrl, "xs");
              const flash = flashProductId === line.productId;
              const pistolOnly = !isInitial && Boolean(line.barcode);
              return (
                <li
                  key={line.productId}
                  data-product-id={line.productId}
                  className={`inv-count-line inv-count-line--${st}${flash ? " is-flash" : ""}${pistolOnly ? " is-pistol-only" : ""}`}
                >
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                      className="inv-count-line__thumb"
                    />
                  ) : (
                    <span className="inv-count-line__thumb inv-count-line__thumb--ph">
                      <Package size={20} strokeWidth={1.5} aria-hidden />
                    </span>
                  )}
                  <div className="inv-count-line__info">
                    <strong>{line.productName}</strong>
                    <span>{line.referenceCode}</span>
                    {pistolOnly ? (
                      <span className="inv-count-line__manual inv-count-line__manual--pistol">
                        Solo pistola
                      </span>
                    ) : isInitial ? (
                      <span className="inv-count-line__manual inv-count-line__manual--pistol">
                        {line.barcode ? "Manual o pistola" : "Sin código · ingreso manual"}
                      </span>
                    ) : (
                      <span className="inv-count-line__manual">Sin código · ingreso manual</span>
                    )}
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(line.expectedQuantity, line.countedQuantity, 1)}
                      aria-valuenow={line.countedQuantity}
                      aria-label={`Progreso de ${line.referenceCode}`}
                      className="inv-count-line__bar"
                    >
                      <div
                        className={`inv-count-line__bar-fill inv-count-line__bar-fill--${st}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="inv-count-line__meta">
                      <span>
                        Contado <strong>{line.countedQuantity}</strong>
                      </span>
                      <span>
                        Sistema <strong>{line.expectedQuantity}</strong>
                      </span>
                      <span
                        className={`inv-count-line__delta inv-count-line__delta--${
                          line.difference === 0 ? "ok" : line.difference > 0 ? "over" : "short"
                        }`}
                      >
                        Δ {line.difference > 0 ? "+" : ""}
                        {line.difference}
                      </span>
                    </div>
                  </div>
                  {pistolOnly ? (
                    <div className="inv-count-line__controls inv-count-line__controls--locked">
                      <span
                        className={`inv-count-line__qty-locked${st === "matched" ? " is-complete" : ""}`}
                        title="Cantidad solo por pistola"
                      >
                        {line.countedQuantity}
                      </span>
                    </div>
                  ) : (
                    <div className="inv-count-line__controls">
                      <button
                        type="button"
                        className="inv-btn inv-btn--ghost inv-count-line__btn"
                        aria-label={`Quitar una unidad de ${line.productName}`}
                        disabled={line.countedQuantity === 0 || saving}
                        onClick={() => void bumpLine(line.productId, -1)}
                      >
                        <Minus size={16} strokeWidth={2.5} aria-hidden />
                      </button>
                      <LineQtyInput
                        value={line.countedQuantity}
                        disabled={saving}
                        onChange={(qty) => void setLineQty(line.productId, qty)}
                        productName={line.productName}
                      />
                      <button
                        type="button"
                        className="inv-btn inv-btn--ghost inv-count-line__btn"
                        aria-label={`Sumar una unidad de ${line.productName}`}
                        disabled={saving}
                        onClick={() => void bumpLine(line.productId, 1)}
                      >
                        <Plus size={16} strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {filteredLines.length === 0 ? (
              <li className="inv-count-list__empty">No hay referencias con este filtro.</li>
            ) : null}
          </ul>

          <footer className="inv-count-actions">
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              disabled={saving}
              onClick={() => void handleResetCounted()}
            >
              <RotateCcw size={16} strokeWidth={2} aria-hidden />
              Resetear cierre
            </button>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              disabled={saving}
              onClick={() => void handleCancel()}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Cancelar
            </button>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              disabled={saving}
              onClick={() => setConfirmOpen(true)}
            >
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
              Aplicar ajuste
              {liveStats.mismatch > 0 ? ` (${liveStats.mismatch})` : ""}
            </button>
          </footer>
        </>
      )}

      {confirmOpen && count ? (
        <div className="inv-modal-backdrop" role="presentation" onClick={() => setConfirmOpen(false)}>
          <div
            className="inv-modal inv-count-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inv-count-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="inv-count-confirm-title">Aplicar ajuste de inventario</h2>
            <p>
              Se escribirán movimientos de cierre para{" "}
              <strong>{liveStats.mismatch}</strong> referencia(s) con descuadre. El stock del sistema
              quedará igual al conteo físico.
            </p>
            <label className="inv-count-notes">
              <span>Notas (opcional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observación del cierre…"
              />
            </label>
            <div className="inv-modal__actions">
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
              >
                Volver
              </button>
              <button
                type="button"
                className="inv-btn inv-btn--primary"
                disabled={saving}
                onClick={() => void handleConfirm()}
              >
                {saving ? "Aplicando…" : "Confirmar ajuste"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <Suspense fallback={null}>
          <BarcodeScannerModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onDetected={(code) => void processScan(code)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
