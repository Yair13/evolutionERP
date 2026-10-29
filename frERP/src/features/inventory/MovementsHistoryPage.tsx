import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  Calendar,
  CheckCircle2,
  CopyPlus,
  Factory,
  FileText,
  History,
  Layers,
  Package,
  Pencil,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  Unlock,
  User,
  X,
} from "lucide-react";
import {
  editInventoryDocument,
  type EditInventoryDocumentPayload,
  fetchDocument,
  fetchDocuments,
  unlockInventoryDocument,
  cancelInventoryDocument,
} from "../../api/inventory.js";
import { DocumentEditModal } from "../../components/inventory/DocumentEditModal.js";
import { DocumentUnlockModal } from "../../components/inventory/DocumentUnlockModal.js";
import { DocumentInvoicePrint } from "../../components/inventory/DocumentInvoicePrint.js";
import { ProductionLabelsModal } from "../../components/inventory/ProductionLabelsModal.js";
import { BackupLabelsModal } from "../../components/inventory/BackupLabelsModal.js";
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { useInventoryScope } from "../../hooks/useInventoryScope.js";
import { clearScanCache } from "../../lib/scanCache.js";
import { documentTypeLabel } from "./document-labels.js";
import type { DocType, InventoryDocumentDetail, InventoryDocumentSummary } from "./inventory.types.js";
import {
  getTodayBogotaYmd,
  getYesterdayBogotaYmd,
  getDaysAgoBogotaYmd,
  getFirstDayOfMonthBogotaYmd,
  formatBogotaDateTimeShort,
  isTodayBogota,
} from "../../lib/dateUtils.js";

type FilterDocType = "" | DocType | "adjustment";

function formatDate(iso: string): string {
  return formatBogotaDateTimeShort(iso);
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  return getTodayBogotaYmd();
}

function localYesterdayYmd(): string {
  return getYesterdayBogotaYmd();
}

function localSevenDaysAgoYmd(): string {
  return getDaysAgoBogotaYmd(6);
}

function localMonthStartYmd(): string {
  return getFirstDayOfMonthBogotaYmd();
}

function docIsToday(doc: { completedAt?: string | null; createdAt: string }): boolean {
  return isTodayBogota(doc.completedAt ?? doc.createdAt);
}

function isExitCategory(docType: string): boolean {
  return docType === "exit" || docType === "warranty" || docType === "return";
}

type MovementsHistoryPageProps = {
  fixedType?: DocType;
};

export function MovementsHistoryPage({ fixedType }: MovementsHistoryPageProps = {}) {
  const { token, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { canViewAllWarehouses, warehouses, isAllWarehouses, sessionLabel, effectiveWarehouseId } =
    useInventoryScope();
  const canManageEditing =
    user?.roles.includes("super_admin") || user?.roles.includes("secretaria") || false;
  const isAdminSede =
    canManageEditing || canViewAllWarehouses || user?.roles.includes("admin_local") || false;

  const [filterType, setFilterType] = useState<FilterDocType>(fixedType ?? "");
  const effectiveType: FilterDocType = fixedType ?? filterType;
  const [selectedSedeId, setSelectedSedeId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState(localTodayYmd);
  const [filterDateTo, setFilterDateTo] = useState(localTodayYmd);
  const [items, setItems] = useState<InventoryDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<InventoryDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingDoc, setEditingDoc] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<InventoryDocumentSummary | null>(null);
  const [unlockSaving, setUnlockSaving] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [labelsDoc, setLabelsDoc] = useState<InventoryDocumentDetail | null>(null);
  const [labelsLoadingId, setLabelsLoadingId] = useState<string | null>(null);
  const [backupModalDoc, setBackupModalDoc] = useState<InventoryDocumentDetail | null>(null);
  const [backupModalLoadingId, setBackupModalLoadingId] = useState<string | null>(null);
  const [backupPrintDoc, setBackupPrintDoc] = useState<InventoryDocumentDetail | null>(null);
  const [backupPrintLoadingId, setBackupPrintLoadingId] = useState<string | null>(null);

  const showAdminSedeFilter = canViewAllWarehouses && isAllWarehouses;

  const baseWh = useMemo(() => {
    if (isAllWarehouses) return null;
    if (effectiveWarehouseId) return effectiveWarehouseId;
    if (warehouses.length === 1) return warehouses[0]!.id;
    return null;
  }, [isAllWarehouses, effectiveWarehouseId, warehouses]);

  const effectiveWh = showAdminSedeFilter ? selectedSedeId || null : baseWh;
  const showWarehouseOnRows = canViewAllWarehouses;

  const activeSedeObj = useMemo(
    () => (selectedSedeId ? warehouses.find((w) => w.id === selectedSedeId) ?? null : null),
    [selectedSedeId, warehouses]
  );

  const scopeText = showAdminSedeFilter
    ? activeSedeObj
      ? `${activeSedeObj.name} (${activeSedeObj.code})`
      : "Todas las sedes · Área Administrativa"
    : sessionLabel;

  const load = useCallback(async () => {
    if (!token) return;
    if (!canViewAllWarehouses && !baseWh) return;
    setLoading(true);
    setError(null);
    try {
      // Si estamos en Historial general (sin fixedType), traemos todos los documentos del rango
      // para calcular contadores por sede y por tipo en tiempo real.
      const queryWh = showAdminSedeFilter ? null : baseWh;
      const queryType = fixedType ?? undefined;
      const data = await fetchDocuments(token, queryWh, queryType, {
        from: filterDateFrom,
        to: filterDateTo,
      });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, baseWh, showAdminSedeFilter, fixedType, filterDateFrom, filterDateTo, canViewAllWarehouses]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const state = location.state as { flash?: string } | null;
    if (state?.flash) {
      setFlash(state.flash);
      navigate(location.pathname, { replace: true, state: null });
      window.setTimeout(() => setFlash(null), 6000);
    }
  }, [location.pathname, location.state, navigate]);

  // Contadores por sede (sobre el rango de fechas actual)
  const countsByWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of items) {
      if (doc.warehouseId) {
        map.set(doc.warehouseId, (map.get(doc.warehouseId) ?? 0) + 1);
      }
    }
    return map;
  }, [items]);

  // Items filtrados por sede seleccionada
  const sedeFilteredItems = useMemo(() => {
    if (!showAdminSedeFilter || !selectedSedeId) return items;
    return items.filter((doc) => doc.warehouseId === selectedSedeId);
  }, [items, showAdminSedeFilter, selectedSedeId]);

  // Contadores por tipo (sobre la sede activa + rango de fechas)
  const typeCounts = useMemo(() => {
    let entries = 0;
    let exits = 0;
    let adjustments = 0;
    for (const doc of sedeFilteredItems) {
      if (doc.docType === "entry") entries += 1;
      else if (doc.docType === "adjustment") adjustments += 1;
      else if (isExitCategory(doc.docType)) exits += 1;
    }
    return {
      all: sedeFilteredItems.length,
      entry: entries,
      exit: exits,
      adjustment: adjustments,
    };
  }, [sedeFilteredItems]);

  // Items finales tras aplicar filtro de tipo + búsqueda por texto
  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sedeFilteredItems.filter((doc) => {
      if (effectiveType === "entry" && doc.docType !== "entry") return false;
      if (effectiveType === "exit" && !isExitCategory(doc.docType)) return false;
      if (effectiveType === "adjustment" && doc.docType !== "adjustment") return false;

      if (!q) return true;
      const label = documentTypeLabel(doc).toLowerCase();
      const inv = (doc.invoiceNumber ?? "").toLowerCase();
      const op = (doc.productionOrderCode ?? "").toLowerCase();
      const cust = (doc.customerName ?? "").toLowerCase();
      const notes = (doc.notes ?? "").toLowerCase();
      const user = (doc.createdByName ?? "").toLowerCase();
      const wh = (doc.warehouseName ?? "").toLowerCase();
      return (
        label.includes(q) ||
        inv.includes(q) ||
        op.includes(q) ||
        cust.includes(q) ||
        notes.includes(q) ||
        user.includes(q) ||
        wh.includes(q)
      );
    });
  }, [sedeFilteredItems, effectiveType, searchQuery]);

  // KPIs dinámicos sobre los documentos visibles (excluyendo anulados)
  const kpiStats = useMemo(() => {
    let entryDocs = 0;
    let entryUnits = 0;
    let exitDocs = 0;
    let exitUnits = 0;
    let exitRevenue = 0;
    let adjustmentDocs = 0;
    let adjustmentUnits = 0;

    for (const doc of visibleItems) {
      if (doc.status === "cancelled") continue;
      if (doc.docType === "entry") {
        entryDocs += 1;
        entryUnits += doc.totalQuantity || 0;
      } else if (doc.docType === "adjustment") {
        adjustmentDocs += 1;
        adjustmentUnits += doc.totalQuantity || 0;
      } else {
        exitDocs += 1;
        exitUnits += doc.totalQuantity || 0;
        exitRevenue += doc.totalAmount || 0;
      }
    }

    return {
      totalDocs: visibleItems.length,
      entryDocs,
      entryUnits,
      exitDocs,
      exitUnits,
      exitRevenue,
      adjustmentDocs,
      adjustmentUnits,
    };
  }, [visibleItems]);

  async function handleCancel(doc: InventoryDocumentSummary) {
    if (!token) return;
    if (
      !window.confirm(
        `¿Estás seguro de anular esta factura/comprobante ${doc.invoiceNumber || ""}? Se restablecerá el inventario de forma automática y quedará registrada como inactiva en el historial.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const wh = doc.warehouseId ?? effectiveWh ?? undefined;
      await cancelInventoryDocument(token, doc.id, wh);
      clearScanCache(wh);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular el documento");
    }
  }

  async function openDocument(doc: InventoryDocumentSummary) {
    if (!token) return;
    setDetailLoading(true);
    setError(null);
    setEditingDoc(false);
    try {
      const wh = doc.warehouseId ?? effectiveWh ?? undefined;
      const { item } = await fetchDocument(token, doc.id, wh);
      setDetail(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el documento");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openDocumentForEdit(doc: InventoryDocumentSummary) {
    await openDocument(doc);
    setEditingDoc(true);
  }

  function isProductionOrderDoc(doc: InventoryDocumentSummary | InventoryDocumentDetail): boolean {
    const et = doc.entryType ?? doc.metadata?.entryType;
    return (
      doc.docType === "entry" &&
      (et === "production_order" ||
        et === "purchase" ||
        Boolean(doc.productionOrderCode) ||
        Boolean(doc.purchaseOrderCode))
    );
  }

  async function openLabels(doc: InventoryDocumentSummary) {
    if (!token) return;
    setLabelsLoadingId(doc.id);
    setError(null);
    try {
      const wh = doc.warehouseId ?? effectiveWh ?? undefined;
      const { item } = await fetchDocument(token, doc.id, wh);
      setLabelsDoc(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden para etiquetas");
    } finally {
      setLabelsLoadingId(null);
    }
  }

  function onLabelsPrinted(updated: InventoryDocumentDetail) {
    setLabelsDoc(updated);
    setItems((prev) =>
      prev.map((row) =>
        row.id === updated.id
          ? {
              ...row,
              labelsPrintedAt: updated.labelsPrintedAt ?? updated.metadata?.labelsPrintedAt ?? null,
              entryType: updated.entryType ?? row.entryType,
              productionOrderCode: updated.productionOrderCode ?? row.productionOrderCode,
            }
          : row
      )
    );
  }

  async function openBackupModal(doc: InventoryDocumentSummary) {
    if (!token) return;
    setBackupModalLoadingId(doc.id);
    setError(null);
    try {
      const wh = doc.warehouseId ?? effectiveWh ?? undefined;
      const { item } = await fetchDocument(token, doc.id, wh);
      setBackupModalDoc(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden para respaldo");
    } finally {
      setBackupModalLoadingId(null);
    }
  }

  async function openBackupPrint(doc: InventoryDocumentSummary) {
    if (!token) return;
    setBackupPrintLoadingId(doc.id);
    setError(null);
    try {
      const wh = doc.warehouseId ?? effectiveWh ?? undefined;
      const { item } = await fetchDocument(token, doc.id, wh);
      setBackupPrintDoc(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la orden para imprimir respaldo");
    } finally {
      setBackupPrintLoadingId(null);
    }
  }

  function onBackupCreated(updated: InventoryDocumentDetail) {
    setItems((prev) =>
      prev.map((row) =>
        row.id === updated.id
          ? {
              ...row,
              backupLabels: updated.backupLabels ?? null,
              metadata: updated.metadata ?? row.metadata,
            }
          : row
      )
    );
    setFlash(`Respaldo de ${updated.backupLabels?.totalQuantity ?? 0} etiquetas generado para la sede.`);
    window.setTimeout(() => setFlash(null), 6000);
  }

  function onBackupPrinted(updated: InventoryDocumentDetail) {
    setBackupPrintDoc(null);
    setItems((prev) =>
      prev.map((row) =>
        row.id === updated.id
          ? {
              ...row,
              backupLabels: updated.backupLabels ?? null,
              metadata: updated.metadata ?? row.metadata,
            }
          : row
      )
    );
    setFlash(`Etiquetas de respaldo (${updated.backupLabels?.totalQuantity ?? 0} uds) impresas correctamente.`);
    window.setTimeout(() => setFlash(null), 6000);
  }

  async function confirmUnlock(observation: string) {
    if (!token || !unlockTarget) return;
    setUnlockSaving(true);
    setUnlockError(null);
    try {
      const wh = unlockTarget.warehouseId ?? effectiveWh ?? undefined;
      const { item } = await unlockInventoryDocument(token, unlockTarget.id, { observation }, wh);
      setItems((prev) =>
        prev.map((row) =>
          row.id === unlockTarget.id
            ? {
                ...row,
                editingUnlocked: item.editingUnlocked ?? true,
                lastUnlockObservation: observation,
              }
            : row
        )
      );
      setUnlockTarget(null);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "No se pudo activar la edición");
    } finally {
      setUnlockSaving(false);
    }
  }

  async function saveDocumentEdit(payload: EditInventoryDocumentPayload) {
    if (!token || !detail) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const wh = detail.warehouseId ?? effectiveWh ?? undefined;
      const { item } = await editInventoryDocument(token, detail.id, payload, wh);
      clearScanCache(wh);
      setDetail(null);
      setEditingDoc(false);
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                editingUnlocked: false,
                editCount: item.editCount,
                lastEditObservation: item.lastEditObservation,
                totalQuantity: item.totalQuantity,
                lineCount: item.lineCount,
                totalAmount: item.totalAmount,
              }
            : row
        )
      );
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setEditSaving(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setEditingDoc(false);
    setEditError(null);
  }

  function resetAllFilters() {
    const t = localTodayYmd();
    setFilterDateFrom(t);
    setFilterDateTo(t);
    if (!fixedType) setFilterType("");
    setSelectedSedeId("");
    setSearchQuery("");
  }

  const todayYmd = localTodayYmd();
  const yesterdayYmd = localYesterdayYmd();
  const sevenDaysYmd = localSevenDaysAgoYmd();
  const monthStartYmd = localMonthStartYmd();

  const isPresetToday = filterDateFrom === todayYmd && filterDateTo === todayYmd;
  const isPresetYesterday = filterDateFrom === yesterdayYmd && filterDateTo === yesterdayYmd;
  const isPreset7Days = filterDateFrom === sevenDaysYmd && filterDateTo === todayYmd;
  const isPresetMonth = filterDateFrom === monthStartYmd && filterDateTo === todayYmd;
  const hasCustomFilters =
    Boolean(selectedSedeId) ||
    Boolean(searchQuery.trim()) ||
    (!fixedType && filterType !== "") ||
    !isPresetToday;

  const pageTitle =
    fixedType === "entry"
      ? "Listado de entradas"
      : fixedType === "exit"
        ? "Listado de ventas"
        : "Historial de Movimientos";
  const HeaderIcon =
    fixedType === "entry"
      ? ArrowDownToLine
      : fixedType === "exit"
        ? ArrowUpFromLine
        : History;
  const pageDescription =
    fixedType === "entry"
      ? "Entradas y órdenes registradas en la sede: ver comprobante, imprimir etiquetas o editar."
      : fixedType === "exit"
        ? "Ventas y salidas registradas en la sede: ver factura, activar edición o anular."
        : "Auditoría centralizada de entradas, salidas, traslados y ajustes de inventario por sede.";
  const backTo =
    fixedType === "entry"
      ? "/app/inventario/entrada"
      : fixedType === "exit"
        ? "/app/inventario/salida"
        : isAllWarehouses
          ? "/app"
          : "/app/inventario";
  const backLabel =
    fixedType === "entry"
      ? "Nueva entrada"
      : fixedType === "exit"
        ? "Nueva venta / salida"
        : isAllWarehouses
          ? "Panel"
          : "Inventario";

  return (
    <div className="inv-page inv-page--history">
      <InventoryPageHeader
        backTo={backTo}
        backLabel={backLabel}
        title={
          <>
            <HeaderIcon size={24} strokeWidth={2} aria-hidden />
            {pageTitle}
          </>
        }
        description={pageDescription}
        actions={
          fixedType === "entry" ? (
            <Link to="/app/inventario/entrada" className="inv-btn inv-btn--primary">
              <ArrowDownToLine size={18} strokeWidth={2} aria-hidden />
              Nueva entrada
            </Link>
          ) : fixedType === "exit" ? (
            <Link to="/app/inventario/salida" className="inv-btn inv-btn--primary">
              <ArrowUpFromLine size={18} strokeWidth={2} aria-hidden />
              Nueva venta / salida
            </Link>
          ) : undefined
        }
      />

      <section className="inv-history-panel" aria-label="Filtros del historial">
        <div className="inv-history-panel__head">
          <div className="inv-history-panel__scope">
            <span className="inv-history-panel__scope-label">Viendo movimientos de</span>
            <strong>{scopeText}</strong>
          </div>
          <div className="inv-history-panel__head-right">
            {hasCustomFilters ? (
              <button
                type="button"
                className="inv-history-reset-btn"
                onClick={resetAllFilters}
                title="Restablecer filtros a Hoy y Todas las sedes"
              >
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden />
                Limpiar filtros
              </button>
            ) : null}
            {canViewAllWarehouses ? (
              <span className="inv-history-panel__badge">Área Administrativa · Acceso total</span>
            ) : null}
          </div>
        </div>

        {/* Fila 1: Búsqueda + Desde / Hasta + Atajos de fecha en una sola línea alineada */}
        <div className="inv-history-toolbar">
          <div className="inv-history-search">
            <label className="inv-history-filter-label" htmlFor="inv-history-search-input">
              Buscar
            </label>
            <div className="inv-history-search__box">
              <Search size={16} strokeWidth={2.2} className="inv-history-search__icon" aria-hidden />
              <input
                id="inv-history-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nº comprobante, cliente, nota o responsable…"
                aria-label="Buscar en el historial"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="inv-history-search__clear"
                  onClick={() => setSearchQuery("")}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="inv-history-date-group">
            <label className="inv-history-date-field">
              <span className="inv-history-filter-label">
                <Calendar size={12} strokeWidth={2.2} aria-hidden /> Desde
              </span>
              <input
                type="date"
                value={filterDateFrom}
                max={filterDateTo}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                aria-label="Fecha desde"
              />
            </label>

            <label className="inv-history-date-field">
              <span className="inv-history-filter-label">
                <Calendar size={12} strokeWidth={2.2} aria-hidden /> Hasta
              </span>
              <input
                type="date"
                value={filterDateTo}
                min={filterDateFrom}
                onChange={(e) => setFilterDateTo(e.target.value)}
                aria-label="Fecha hasta"
              />
            </label>

            <div className="inv-history-presets-wrap">
              <span className="inv-history-filter-label">Periodo rápido</span>
              <div className="inv-history-presets" role="group" aria-label="Rangos rápidos de fecha">
                <button
                  type="button"
                  className={`inv-pill-filter${isPresetToday ? " is-active" : ""}`}
                  onClick={() => {
                    const t = localTodayYmd();
                    setFilterDateFrom(t);
                    setFilterDateTo(t);
                  }}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className={`inv-pill-filter${isPresetYesterday ? " is-active" : ""}`}
                  onClick={() => {
                    const y = localYesterdayYmd();
                    setFilterDateFrom(y);
                    setFilterDateTo(y);
                  }}
                >
                  Ayer
                </button>
                <button
                  type="button"
                  className={`inv-pill-filter${isPreset7Days ? " is-active" : ""}`}
                  onClick={() => {
                    setFilterDateFrom(localSevenDaysAgoYmd());
                    setFilterDateTo(localTodayYmd());
                  }}
                >
                  7 días
                </button>
                <button
                  type="button"
                  className={`inv-pill-filter${isPresetMonth ? " is-active" : ""}`}
                  onClick={() => {
                    setFilterDateFrom(localMonthStartYmd());
                    setFilterDateTo(localTodayYmd());
                  }}
                >
                  Este mes
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Fila 2: Sedes + Tipo de movimiento integrados y alineados */}
        <div className="inv-history-bottom-filters">
          {showAdminSedeFilter && warehouses.length > 0 ? (
            <div className="inv-history-filter-block" role="group" aria-label="Filtrar por sede">
              <span className="inv-history-filter-label">
                <Building2 size={12} strokeWidth={2.2} aria-hidden /> Sede operativa
              </span>
              <div className="inv-history-sedes__pills">
                <button
                  type="button"
                  className={`inv-sede-pill${selectedSedeId === "" ? " is-active" : ""}`}
                  onClick={() => setSelectedSedeId("")}
                >
                  <Building2 size={14} strokeWidth={2} aria-hidden />
                  <span className="inv-sede-pill__name">Todas</span>
                  <span className="inv-sede-pill__count">{items.length}</span>
                </button>
                {warehouses.map((w) => {
                  const count = countsByWarehouse.get(w.id) ?? 0;
                  const active = selectedSedeId === w.id;
                  const SedeIcon = w.is_factory ? Factory : Store;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      className={`inv-sede-pill${active ? " is-active" : ""}${w.is_factory ? " inv-sede-pill--factory" : ""}`}
                      onClick={() => setSelectedSedeId(active ? "" : w.id)}
                    >
                      <SedeIcon size={14} strokeWidth={2} aria-hidden />
                      <span className="inv-sede-pill__name">{w.name}</span>
                      <span className="inv-sede-pill__code">{w.code}</span>
                      <span className="inv-sede-pill__count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!fixedType ? (
            <div className="inv-history-filter-block" role="group" aria-label="Tipo de movimiento">
              <span className="inv-history-filter-label">Tipo de movimiento</span>
              <div className="inv-history-type-pills">
                <button
                  type="button"
                  className={`inv-type-chip${filterType === "" ? " is-active" : ""}`}
                  onClick={() => setFilterType("")}
                >
                  <Layers size={14} strokeWidth={2.2} aria-hidden />
                  <span>Todos</span>
                  <span className="inv-type-chip__badge">{typeCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={`inv-type-chip inv-type-chip--entry${filterType === "entry" ? " is-active" : ""}`}
                  onClick={() => setFilterType("entry")}
                >
                  <ArrowDownToLine size={14} strokeWidth={2.2} aria-hidden />
                  <span>Entradas</span>
                  <span className="inv-type-chip__badge">{typeCounts.entry}</span>
                </button>
                <button
                  type="button"
                  className={`inv-type-chip inv-type-chip--exit${filterType === "exit" ? " is-active" : ""}`}
                  onClick={() => setFilterType("exit")}
                >
                  <ArrowUpFromLine size={14} strokeWidth={2.2} aria-hidden />
                  <span>Salidas / Ventas</span>
                  <span className="inv-type-chip__badge">{typeCounts.exit}</span>
                </button>
                <button
                  type="button"
                  className={`inv-type-chip inv-type-chip--adjustment${filterType === "adjustment" ? " is-active" : ""}`}
                  onClick={() => setFilterType("adjustment")}
                >
                  <SlidersHorizontal size={14} strokeWidth={2.2} aria-hidden />
                  <span>Ajustes</span>
                  <span className="inv-type-chip__badge">{typeCounts.adjustment}</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Tarjetas de resumen rápido (KPIs del filtro actual) */}
      {!loading && visibleItems.length > 0 ? (
        <section className="inv-history-kpis" aria-label="Resumen de movimientos filtrados">
          <div className="inv-history-kpi">
            <div className="inv-history-kpi__icon inv-history-kpi__icon--all" aria-hidden>
              <Layers size={18} strokeWidth={2} />
            </div>
            <div className="inv-history-kpi__body">
              <span className="inv-history-kpi__label">Movimientos</span>
              <strong className="inv-history-kpi__value">{kpiStats.totalDocs}</strong>
              <span className="inv-history-kpi__sub">En la vista actual</span>
            </div>
          </div>

          <div className="inv-history-kpi">
            <div className="inv-history-kpi__icon inv-history-kpi__icon--entry" aria-hidden>
              <ArrowDownToLine size={18} strokeWidth={2} />
            </div>
            <div className="inv-history-kpi__body">
              <span className="inv-history-kpi__label">Entradas</span>
              <strong className="inv-history-kpi__value">{kpiStats.entryUnits} uds</strong>
              <span className="inv-history-kpi__sub">
                {kpiStats.entryDocs} {kpiStats.entryDocs === 1 ? "registro" : "registros"}
              </span>
            </div>
          </div>

          <div className="inv-history-kpi">
            <div className="inv-history-kpi__icon inv-history-kpi__icon--exit" aria-hidden>
              <ArrowUpFromLine size={18} strokeWidth={2} />
            </div>
            <div className="inv-history-kpi__body">
              <span className="inv-history-kpi__label">Salidas / Ventas</span>
              <strong className="inv-history-kpi__value">
                {kpiStats.exitRevenue > 0 ? formatMoney(kpiStats.exitRevenue) : `${kpiStats.exitUnits} uds`}
              </strong>
              <span className="inv-history-kpi__sub">
                {kpiStats.exitDocs} {kpiStats.exitDocs === 1 ? "salida" : "salidas"} · {kpiStats.exitUnits} uds
              </span>
            </div>
          </div>

          <div className="inv-history-kpi">
            <div className="inv-history-kpi__icon inv-history-kpi__icon--adjustment" aria-hidden>
              <SlidersHorizontal size={18} strokeWidth={2} />
            </div>
            <div className="inv-history-kpi__body">
              <span className="inv-history-kpi__label">Ajustes de inventario</span>
              <strong className="inv-history-kpi__value">{kpiStats.adjustmentUnits} uds</strong>
              <span className="inv-history-kpi__sub">
                {kpiStats.adjustmentDocs} {kpiStats.adjustmentDocs === 1 ? "conteo/ajuste" : "conteos/ajustes"}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {flash ? (
        <p className="inv-success" role="status">
          {flash}
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {detailLoading ? (
        <p className="inv-page__desc" role="status">
          Cargando comprobante…
        </p>
      ) : null}

      {loading ? (
        <p className="inv-page__desc">Cargando movimientos…</p>
      ) : visibleItems.length === 0 ? (
        <div className="inv-empty">
          <p>
            {fixedType === "entry"
              ? "No hay entradas registradas en este rango de fechas."
              : fixedType === "exit"
                ? "No hay ventas ni salidas registradas en este rango de fechas."
                : "No hay movimientos que coincidan con los filtros seleccionados."}
          </p>
          {hasCustomFilters ? (
            <button type="button" className="inv-btn inv-btn--ghost" onClick={resetAllFilters}>
              <RotateCcw size={16} strokeWidth={2} aria-hidden />
              Restablecer filtros
            </button>
          ) : null}
          {fixedType === "exit" ? (
            <Link to="/app/inventario/salida" className="inv-btn inv-btn--primary">
              <ArrowUpFromLine size={18} strokeWidth={2} aria-hidden />
              Nueva venta / salida
            </Link>
          ) : !isAllWarehouses ? (
            <Link to="/app/inventario/entrada" className="inv-btn inv-btn--primary">
              <ArrowDownToLine size={18} strokeWidth={2} aria-hidden />
              Nueva entrada
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="inv-history-list">
          {visibleItems.map((doc) => {
            const cancelled = doc.status === "cancelled";
            const isAdjustment = doc.docType === "adjustment";
            const isEntry = doc.docType === "entry";
            const isOp = isProductionOrderDoc(doc);
            const labelsPrinted = Boolean(doc.labelsPrintedAt);
            const backup = doc.backupLabels || doc.metadata?.backupLabels;
            const hasPendingBackup = backup?.status === "pending" && (backup.totalQuantity ?? 0) > 0;
            const hasPrintedBackup = backup?.status === "printed" && (backup.totalQuantity ?? 0) > 0;
            const variant = isAdjustment ? "adjustment" : isEntry ? "entry" : "exit";
            const Icon = isAdjustment
              ? SlidersHorizontal
              : isEntry
                ? ArrowDownToLine
                : ArrowUpFromLine;
            const when = doc.completedAt ?? doc.createdAt;
            const label = documentTypeLabel(doc);
            const showAmount = !isEntry && !isAdjustment && (doc.totalAmount ?? 0) > 0;
            const edited = (doc.editCount ?? 0) > 0;
            const showEditActions =
              canManageEditing && docIsToday(doc) && !cancelled && !isAdjustment;
            const unlocked = doc.editingUnlocked === true;
            const docCode = doc.invoiceNumber || doc.productionOrderCode || doc.purchaseOrderCode;
            const countSubLabel =
              isAdjustment && doc.metadata?.countKind === "initial"
                ? "Inventario inicial"
                : isAdjustment && doc.metadata?.countKind === "audit"
                  ? "Cierre de conteo"
                  : null;

            return (
              <li key={doc.id} className="inv-history-list__item">
                <article
                  className={`inv-history-card inv-history-card--${variant}${cancelled ? " inv-history-card--cancelled" : ""}`}
                >
                  <div className="inv-history-card__main">
                    <div className="inv-history-card__icon" aria-hidden>
                      <Icon size={20} strokeWidth={2.2} />
                    </div>

                    <div className="inv-history-card__body">
                      <div className="inv-history-card__row">
                        <div className="inv-history-card__tags">
                          <span className={`inv-history-card__type inv-history-card__type--${variant}`}>
                            {label}
                          </span>
                          {countSubLabel ? (
                            <span className="inv-history-card__subkind">{countSubLabel}</span>
                          ) : null}
                          {showWarehouseOnRows && doc.warehouseName ? (
                            <span className="inv-history-card__warehouse">
                              <Building2 size={12} strokeWidth={2.2} aria-hidden />
                              {doc.warehouseName}
                            </span>
                          ) : null}
                          {docCode ? (
                            <span className="inv-history-card__code-pill">Nº {docCode}</span>
                          ) : null}
                          {cancelled ? (
                            <span className="inv-history-card__cancelled">Anulada</span>
                          ) : null}
                          {unlocked ? (
                            <span className="inv-history-card__unlock-badge">Edición activa</span>
                          ) : null}
                          {edited ? <span className="inv-history-card__edited">Editado</span> : null}
                          {isOp && labelsPrinted ? (
                            <span className="inv-history-card__edited">Etiquetas impresas</span>
                          ) : null}
                          {isOp && hasPendingBackup ? (
                            <span
                              className="inv-history-card__backup-badge inv-history-card__backup-badge--pending"
                              title={`Respaldo solicitado por ${backup?.requestedByName ?? "administración"}`}
                            >
                              Respaldo pendiente ({backup?.totalQuantity} uds)
                            </span>
                          ) : null}
                          {isOp && hasPrintedBackup ? (
                            <span
                              className="inv-history-card__backup-badge inv-history-card__backup-badge--printed"
                              title={`Respaldo impreso el ${formatDate(backup?.printedAt!)}${backup?.printedByName ? ` por ${backup.printedByName}` : ""}`}
                            >
                              Respaldo generado ({backup?.totalQuantity} uds)
                            </span>
                          ) : null}
                        </div>
                        {showAmount ? (
                          <span className="inv-history-card__amount">{formatMoney(doc.totalAmount!)}</span>
                        ) : null}
                      </div>

                      <div className="inv-history-card__meta">
                        <span className="inv-history-card__meta-item">
                          <Calendar size={13} strokeWidth={2} aria-hidden />
                          <time dateTime={when}>{formatDate(when)}</time>
                        </span>
                        <span className="inv-history-card__meta-sep" aria-hidden>
                          ·
                        </span>
                        <span className="inv-history-card__meta-item">
                          <Package size={13} strokeWidth={2} aria-hidden />
                          {doc.lineCount} {doc.lineCount === 1 ? "línea" : "líneas"} ·{" "}
                          <strong>{doc.totalQuantity} uds</strong>
                        </span>
                        {doc.createdByName ? (
                          <>
                            <span className="inv-history-card__meta-sep" aria-hidden>
                              ·
                            </span>
                            <span className="inv-history-card__meta-item">
                              <User size={13} strokeWidth={2} aria-hidden />
                              {doc.createdByName}
                            </span>
                          </>
                        ) : null}
                      </div>

                      {doc.lastUnlockObservation ? (
                        <p className="inv-history-card__obs">
                          <span>Motivo activación:</span> {doc.lastUnlockObservation}
                        </p>
                      ) : null}

                      {(!isEntry && !isAdjustment && doc.customerName) || doc.notes ? (
                        <p className="inv-history-card__extra">
                          {!isEntry && !isAdjustment && doc.customerName ? (
                            <span className="inv-history-card__customer">
                              Cliente: <strong>{doc.customerName}</strong>
                            </span>
                          ) : null}
                          {doc.notes ? <span className="inv-history-card__notes">“{doc.notes}”</span> : null}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="inv-history-card__actions">
                    <button
                      type="button"
                      className="inv-history-card__action"
                      onClick={() => void openDocument(doc)}
                    >
                      <FileText size={15} strokeWidth={2} aria-hidden />
                      {isAdjustment ? "Ver detalle" : isEntry ? "Ver comprobante" : "Ver factura"}
                    </button>
                    {isOp && !cancelled ? (
                      <button
                        type="button"
                        className="inv-history-card__action inv-history-card__action--primary"
                        disabled={labelsLoadingId === doc.id}
                        title="Imprimir etiquetas de esta orden"
                        onClick={() => void openLabels(doc)}
                      >
                        <Tag size={15} strokeWidth={2} aria-hidden />
                        {labelsLoadingId === doc.id ? "Cargando…" : "Imprimir etiquetas"}
                      </button>
                    ) : null}
                    {isOp && !cancelled && isAdminSede ? (
                      <button
                        type="button"
                        className="inv-history-card__action"
                        disabled={backupModalLoadingId === doc.id}
                        title="Generar o ajustar etiquetas de respaldo para esta orden de producción"
                        onClick={() => void openBackupModal(doc)}
                      >
                        <CopyPlus size={15} strokeWidth={2} aria-hidden />
                        {backupModalLoadingId === doc.id ? "Cargando…" : "Etiquetas de respaldo"}
                      </button>
                    ) : null}
                    {isOp && !cancelled && hasPendingBackup ? (
                      <button
                        type="button"
                        className="inv-history-card__action inv-history-card__action--backup-print"
                        disabled={backupPrintLoadingId === doc.id}
                        title={`Imprimir ${backup?.totalQuantity} etiquetas de respaldo autorizadas`}
                        onClick={() => void openBackupPrint(doc)}
                      >
                        <Printer size={15} strokeWidth={2} aria-hidden />
                        {backupPrintLoadingId === doc.id
                          ? "Cargando…"
                          : `Imprimir respaldo (${backup?.totalQuantity})`}
                      </button>
                    ) : null}
                    {isOp && !cancelled && hasPrintedBackup ? (
                      <span
                        className="inv-history-card__action inv-history-card__action--backup-completed"
                        title={`Respaldo impreso el ${formatDate(backup?.printedAt!)}${backup?.printedByName ? ` por ${backup.printedByName}` : ""}`}
                      >
                        <CheckCircle2 size={15} strokeWidth={2} aria-hidden />
                        Respaldo generado ({backup?.totalQuantity})
                      </span>
                    ) : null}
                    {!cancelled && canManageEditing && !isAdjustment ? (
                      <button
                        type="button"
                        className="inv-history-card__action inv-history-card__action--danger"
                        onClick={() => void handleCancel(doc)}
                      >
                        Anular
                      </button>
                    ) : null}
                    {showEditActions ? (
                      <>
                        {!unlocked ? (
                          <button
                            type="button"
                            className="inv-history-card__action"
                            onClick={() => {
                              setUnlockError(null);
                              setUnlockTarget(doc);
                            }}
                          >
                            <Unlock size={15} strokeWidth={2} aria-hidden />
                            Activar edición
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="inv-history-card__action inv-history-card__action--primary"
                          disabled={!unlocked}
                          title={unlocked ? "Editar este movimiento" : "Primero activa la edición"}
                          onClick={() => void openDocumentForEdit(doc)}
                        >
                          <Pencil size={15} strokeWidth={2} aria-hidden />
                          Editar
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {detail && !editingDoc ? (
        <DocumentInvoicePrint document={detail} onClose={closeDetail} />
      ) : null}

      {labelsDoc && token ? (
        <ProductionLabelsModal
          document={labelsDoc}
          token={token}
          warehouseId={labelsDoc.warehouseId ?? effectiveWh}
          onClose={() => setLabelsDoc(null)}
          onPrinted={onLabelsPrinted}
        />
      ) : null}

      {backupModalDoc && token ? (
        <BackupLabelsModal
          document={backupModalDoc}
          token={token}
          warehouseId={backupModalDoc.warehouseId ?? effectiveWh}
          onClose={() => setBackupModalDoc(null)}
          onSuccess={onBackupCreated}
        />
      ) : null}

      {backupPrintDoc && token ? (
        <ProductionLabelsModal
          document={backupPrintDoc}
          token={token}
          warehouseId={backupPrintDoc.warehouseId ?? effectiveWh}
          mode="backup"
          onClose={() => setBackupPrintDoc(null)}
          onPrinted={onBackupPrinted}
        />
      ) : null}

      {detail && editingDoc && (detail.warehouseId ?? effectiveWh) ? (
        <DocumentEditModal
          document={detail}
          warehouseId={detail.warehouseId ?? effectiveWh!}
          token={token!}
          saving={editSaving}
          error={editError}
          onClose={() => {
            setEditingDoc(false);
            setEditError(null);
          }}
          onSave={(payload) => void saveDocumentEdit(payload)}
        />
      ) : null}

      {unlockTarget ? (
        <DocumentUnlockModal
          document={unlockTarget}
          saving={unlockSaving}
          error={unlockError}
          onClose={() => {
            setUnlockTarget(null);
            setUnlockError(null);
          }}
          onConfirm={(observation) => void confirmUnlock(observation)}
        />
      ) : null}
    </div>
  );
}
