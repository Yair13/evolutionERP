import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  Pencil,
  History,
  Tag,
  Unlock,
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
import { InventoryPageHeader } from "../../components/inventory/InventoryPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { useInventoryScope } from "../../hooks/useInventoryScope.js";
import { documentTypeLabel } from "./document-labels.js";
import type { DocType, InventoryDocumentDetail, InventoryDocumentSummary } from "./inventory.types.js";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  return new Date().toLocaleDateString("en-CA");
}

function docIsToday(doc: { completedAt?: string | null; createdAt: string }): boolean {
  const when = doc.completedAt ?? doc.createdAt;
  try {
    return new Date(when).toLocaleDateString("en-CA") === localTodayYmd();
  } catch {
    return false;
  }
}

export function MovementsHistoryPage() {
  const { token, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { canViewAllWarehouses, warehouses, isAllWarehouses, sessionLabel, effectiveWarehouseId } =
    useInventoryScope();
  const canManageEditing =
    user?.roles.includes("super_admin") || user?.roles.includes("secretaria") || false;

  const [filterType, setFilterType] = useState<"" | DocType>("");
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

  async function handleCancel(doc: InventoryDocumentSummary) {
    if (!token) return;
    if (!window.confirm(`¿Estás seguro de anular esta factura/comprobante ${doc.invoiceNumber || ""}? Se restablecerá el inventario de forma automática y quedará registrada como inactiva en el historial.`)) {
      return;
    }
    setError(null);
    try {
      const wh = doc.warehouseId ?? effectiveWh ?? undefined;
      await cancelInventoryDocument(token, doc.id, wh);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular el documento");
    }
  }

  const effectiveWh = useMemo(() => {
    if (isAllWarehouses) return null;
    if (effectiveWarehouseId) return effectiveWarehouseId;
    if (warehouses.length === 1) return warehouses[0]!.id;
    return null;
  }, [isAllWarehouses, effectiveWarehouseId, warehouses]);

  const showWarehouseOnRows = canViewAllWarehouses && !effectiveWh;
  const scopeText = sessionLabel;

  const load = useCallback(async () => {
    if (!token) return;
    if (!canViewAllWarehouses && !effectiveWh) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDocuments(token, effectiveWh, filterType || undefined, {
        from: filterDateFrom,
        to: filterDateTo,
      });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, effectiveWh, filterType, filterDateFrom, filterDateTo, canViewAllWarehouses]);

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
    return (
      doc.docType === "entry" &&
      (doc.entryType === "production_order" ||
        Boolean(doc.productionOrderCode) ||
        doc.metadata?.entryType === "production_order")
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

  return (
    <div className="inv-page inv-page--history">
      <InventoryPageHeader
        backTo="/app/inventario"
        backLabel="Inventario"
        title={
          <>
            <History size={24} strokeWidth={2} aria-hidden />
            Historial
          </>
        }
        description="Cada movimiento del día tiene sus acciones: ver factura, activar edición (una vez) y editar."
      />

      <section className="inv-history-panel" aria-label="Filtros del historial">
        <div className="inv-history-panel__head">
          <div className="inv-history-panel__scope">
            <span className="inv-history-panel__scope-label">Viendo</span>
            <strong>{scopeText}</strong>
          </div>
          {canViewAllWarehouses ? (
            <span className="inv-history-panel__badge">Acceso total</span>
          ) : null}
        </div>

        <div className="inv-history-panel__controls">
          <label className="inv-history-panel__field inv-history-panel__field--date">
            <span>Desde</span>
            <input
              type="date"
              value={filterDateFrom}
              max={filterDateTo}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              aria-label="Fecha desde"
            />
          </label>

          <label className="inv-history-panel__field inv-history-panel__field--date">
            <span>Hasta</span>
            <input
              type="date"
              value={filterDateTo}
              min={filterDateFrom}
              onChange={(e) => setFilterDateTo(e.target.value)}
              aria-label="Fecha hasta"
            />
          </label>

          <div className="inv-history-panel__types" role="group" aria-label="Tipo de movimiento">
            <span className="inv-history-panel__types-label">Tipo</span>
            <div className="inv-pill-filters">
              <button
                type="button"
                className={`inv-pill-filter${filterType === "" ? " is-active" : ""}`}
                onClick={() => setFilterType("")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`inv-pill-filter inv-pill-filter--entry${filterType === "entry" ? " is-active" : ""}`}
                onClick={() => setFilterType("entry")}
              >
                Entradas
              </button>
              <button
                type="button"
                className={`inv-pill-filter inv-pill-filter--exit${filterType === "exit" ? " is-active" : ""}`}
                onClick={() => setFilterType("exit")}
              >
                Salidas
              </button>
            </div>
          </div>
        </div>
      </section>

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
      ) : items.length === 0 ? (
        <div className="inv-empty">
          <p>No hay movimientos con estos filtros.</p>
          <Link to="/app/inventario/entrada" className="inv-btn inv-btn--primary">
            <ArrowDownToLine size={18} strokeWidth={2} aria-hidden />
            Registrar entrada
          </Link>
        </div>
      ) : (
        <ul className="inv-history-list">
          {items.map((doc) => {
            const cancelled = doc.status === "cancelled";
            const isEntry = doc.docType === "entry";
            const isOp = isProductionOrderDoc(doc);
            const labelsPrinted = Boolean(doc.labelsPrintedAt);
            const Icon = isEntry ? ArrowDownToLine : ArrowUpFromLine;
            const when = doc.completedAt ?? doc.createdAt;
            const label = documentTypeLabel(doc);
            const showAmount = !isEntry && (doc.totalAmount ?? 0) > 0;
            const edited = (doc.editCount ?? 0) > 0;
            const showEditActions = canManageEditing && docIsToday(doc) && !cancelled;
            const unlocked = doc.editingUnlocked === true;

            return (
              <li key={doc.id} className="inv-history-list__item">
                <article
                  className={`inv-history-card inv-history-card--${isEntry ? "entry" : "exit"}${cancelled ? " inv-history-card--cancelled" : ""}`}
                >
                  <div className="inv-history-card__main">
                  <div className="inv-history-card__icon" aria-hidden>
                    <Icon size={20} strokeWidth={2} />
                  </div>

                  <div className="inv-history-card__body">
                    <div className="inv-history-card__row">
                      <div className="inv-history-card__tags">
                        <span
                          className={`inv-history-card__type inv-history-card__type--${isEntry ? "entry" : "exit"}`}
                        >
                          {label}
                        </span>
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
                        {showWarehouseOnRows && doc.warehouseName ? (
                          <span className="inv-history-card__warehouse">{doc.warehouseName}</span>
                        ) : null}
                      </div>
                      {showAmount ? (
                        <span className="inv-history-card__amount">{formatMoney(doc.totalAmount!)}</span>
                      ) : null}
                    </div>

                    <p className="inv-history-card__meta">
                      <time dateTime={when}>{formatDate(when)}</time>
                      <span aria-hidden>·</span>
                      <span>
                        {doc.lineCount} {doc.lineCount === 1 ? "línea" : "líneas"} · {doc.totalQuantity} uds
                      </span>
                      {doc.createdByName ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{doc.createdByName}</span>
                        </>
                      ) : null}
                    </p>

                    {doc.lastUnlockObservation ? (
                      <p className="inv-history-card__obs">
                        <span>Motivo activación:</span> {doc.lastUnlockObservation}
                      </p>
                    ) : null}

                    {(isOp && (doc.invoiceNumber || doc.productionOrderCode)) ||
                    (!isEntry && (doc.invoiceNumber || doc.customerName)) ||
                    doc.notes ? (
                      <p className="inv-history-card__extra">
                        {isOp && (doc.invoiceNumber || doc.productionOrderCode) ? (
                          <span className="inv-history-card__invoice">
                            Nº {doc.invoiceNumber || doc.productionOrderCode}
                          </span>
                        ) : null}
                        {!isEntry && doc.invoiceNumber ? (
                          <span className="inv-history-card__invoice">Nº {doc.invoiceNumber}</span>
                        ) : null}
                        {!isEntry && doc.customerName ? <span>{doc.customerName}</span> : null}
                        {doc.notes ? <span className="inv-history-card__notes">{doc.notes}</span> : null}
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
                      Ver factura
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
                    {!cancelled && canManageEditing ? (
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
