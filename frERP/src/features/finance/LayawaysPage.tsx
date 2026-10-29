import { useState, useEffect, useCallback } from "react";
import {
  fetchLayaways,
  type LayawaySummaryItem,
  type LayawayStatus,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { CreateLayawayModal } from "../../components/finance/CreateLayawayModal.js";
import { AddLayawayPaymentModal } from "../../components/finance/AddLayawayPaymentModal.js";
import { LayawayDetailModal } from "../../components/finance/LayawayDetailModal.js";
import { formatBogotaDate } from "../../lib/dateUtils.js";
import {
  Bookmark,
  PlusCircle,
  Search,
  Wallet,
  Eye,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
} from "lucide-react";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  return formatBogotaDate(iso);
}

export function LayawaysPage() {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses, loading: whLoading } = useWarehouse();

  // Filtros
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouse(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);

  const effectiveWarehouse = isAllWarehouses ? selectedWarehouse : (warehouseId || "");
  const [selectedStatus, setSelectedStatus] = useState<string>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Paginación y datos
  const [items, setItems] = useState<LayawaySummaryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;

  // Resumen
  const [summary, setSummary] = useState({
    activeCount: 0,
    totalTarget: 0,
    totalCollected: 0,
    totalRemaining: 0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [openCreate, setOpenCreate] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState<LayawaySummaryItem | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token || whLoading) return;
    if (!isAllWarehouses && !warehouseId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchLayaways(token, {
        warehouseId: effectiveWarehouse || null,
        status: selectedStatus === "all" ? null : (selectedStatus as LayawayStatus),
        q: searchQuery.trim() || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit,
        offset: (page - 1) * limit,
      });

      setItems(res.items);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los apartados.");
    } finally {
      setLoading(false);
    }
  }, [token, whLoading, isAllWarehouses, warehouseId, effectiveWarehouse, selectedStatus, searchQuery, dateFrom, dateTo, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="fin-page">
      {/* Header */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--indigo">
              <Bookmark size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Plan Separe / Apartados</h1>
              <p className="fin-header__subtitle">
                Control de abonos de clientes para apartar mercancía, liquidación en caja y saldos a favor.
              </p>
            </div>
          </div>
        </div>

        <div className="fin-header__actions">
          <button
            type="button"
            className="fin-btn fin-btn--primary"
            onClick={() => setOpenCreate(true)}
          >
            <PlusCircle size={17} />
            <span>Nuevo Apartado</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="fin-kpi-grid fin-kpi-grid--4">
        <div className="fin-kpi-card fin-kpi-card--indigo">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label">Apartados Activos</span>
            <div className="fin-kpi-icon fin-kpi-icon--indigo">
              <Bookmark size={18} />
            </div>
          </div>
          <div className="fin-kpi-val fin-kpi-val--indigo">
            {summary.activeCount}
          </div>
          <div className="fin-kpi-sub">
            Clientes con mercancía reservada
          </div>
        </div>

        <div className="fin-kpi-card fin-kpi-card--teal">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label">Total Mercancía</span>
            <div className="fin-kpi-icon fin-kpi-icon--teal">
              <Clock size={18} />
            </div>
          </div>
          <div className="fin-kpi-val fin-kpi-val--teal">
            {formatMoney(summary.totalTarget)}
          </div>
          <div className="fin-kpi-sub">
            Valor acumulado en planes
          </div>
        </div>

        <div className="fin-kpi-card fin-kpi-card--emerald">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label" style={{ color: "#059669" }}>Total Recaudado</span>
            <div className="fin-kpi-icon fin-kpi-icon--emerald">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="fin-kpi-val fin-kpi-val--emerald">
            {formatMoney(summary.totalCollected)}
          </div>
          <div className="fin-kpi-sub">
            Dinero recibido en caja por abonos
          </div>
        </div>

        <div className="fin-kpi-card fin-kpi-card--amber">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label" style={{ color: "#d97706" }}>Saldo Pendiente</span>
            <div className="fin-kpi-icon fin-kpi-icon--amber">
              <Wallet size={18} />
            </div>
          </div>
          <div className="fin-kpi-val fin-kpi-val--amber">
            {formatMoney(summary.totalRemaining)}
          </div>
          <div className="fin-kpi-sub">
            Por cobrar antes de entregar
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="fin-filter-card">
        {/* Sede */}
        {isAllWarehouses ? (
          <div className="fin-filter-field" style={{ minWidth: 170 }}>
            <span>SEDE</span>
            <select
              className="fin-select"
              value={selectedWarehouse}
              onChange={(e) => {
                setSelectedWarehouse(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las sedes</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="fin-filter-field" style={{ minWidth: 160 }}>
            <span>SEDE ACTUAL</span>
            <input
              className="fin-input"
              disabled
              value={warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
            />
          </div>
        )}

        {/* Estado */}
        <div className="fin-filter-field" style={{ minWidth: 150 }}>
          <span>ESTADO</span>
          <select
            className="fin-select"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos los Estados</option>
            <option value="active">Activos / Vigentes</option>
            <option value="completed">Completados / Redimidos</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </div>

        {/* Búsqueda */}
        <div className="fin-filter-field" style={{ flex: 2, minWidth: 220 }}>
          <span>BUSCAR CLIENTE O CÓDIGO</span>
          <div className="fin-search-wrap">
            <Search size={16} className="fin-search-wrap__icon" />
            <input
              className="fin-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por código, nombre, cédula o teléfono..."
            />
          </div>
        </div>

        {/* Fechas */}
        <div className="fin-filter-field" style={{ minWidth: 130 }}>
          <span>DESDE</span>
          <input
            className="fin-input"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="fin-filter-field" style={{ minWidth: 130 }}>
          <span>HASTA</span>
          <input
            className="fin-input"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="fin-filter-field fin-filter-field--fixed">
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => void loadData()}
            title="Refrescar datos"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {error && <div className="fin-alert fin-alert--danger">{error}</div>}

      {/* Tabla de Resultados */}
      <div className="fin-table-card">
        <div className="fin-table-header">
          <h3 className="fin-table-title">
            <Bookmark size={18} color="var(--accent)" />
            <span>Listado de Planes Separe</span>
          </h3>
          <span className="fin-badge fin-badge--neutral">
            {total} apartados encontrados
          </span>
        </div>

        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Sede</th>
                <th style={{ textAlign: "right" }}>Meta Total</th>
                <th style={{ textAlign: "right" }}>Abonado</th>
                <th style={{ minWidth: 120 }}>Avance</th>
                <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                <th style={{ textAlign: "center" }}>Estado</th>
                <th>Creación</th>
                <th>Vence</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                    <RefreshCw size={24} className="spin" style={{ margin: "0 auto 0.5rem" }} />
                    <div>Cargando apartados…</div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                    <Filter size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>No se encontraron apartados con los filtros seleccionados</div>
                    <div style={{ fontSize: "0.82rem", marginTop: 4 }}>Usa el botón "Nuevo Apartado" para registrar una separación.</div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const percent = item.targetAmount > 0
                    ? Math.min(100, Math.round((item.paidAmount / item.targetAmount) * 100))
                    : 0;

                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="fin-badge fin-badge--teal" style={{ fontWeight: 800 }}>
                          {item.code}
                        </span>
                      </td>
                      <td>
                        <div>
                          <strong style={{ color: "#0f172a" }}>{item.customerName}</strong>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            CC: {item.customerTaxId || "—"} · Tel: {item.customerPhone || "—"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="fin-badge fin-badge--neutral">{item.warehouseName}</span>
                      </td>
                      <td className="fin-table-num">
                        {formatMoney(item.targetAmount)}
                      </td>
                      <td className="fin-table-num" style={{ color: "#059669", fontWeight: 700 }}>
                        {formatMoney(item.paidAmount)}
                      </td>
                      <td>
                        <div className="fin-progress">
                          <div className="fin-progress__bar-wrap">
                            <div
                              className="fin-progress__bar-fill"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <div className="fin-progress__text">
                            <span>{percent}%</span>
                          </div>
                        </div>
                      </td>
                      <td className="fin-table-num">
                        <strong style={{ color: item.remainingAmount === 0 ? "#059669" : "#d97706", fontSize: "0.95rem" }}>
                          {formatMoney(item.remainingAmount)}
                        </strong>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {item.status === "active" && (
                          <span className="fin-badge fin-badge--warning">
                            Activo
                          </span>
                        )}
                        {item.status === "completed" && (
                          <span className="fin-badge fin-badge--success">
                            Redimido
                          </span>
                        )}
                        {item.status === "cancelled" && (
                          <span className="fin-badge fin-badge--danger">
                            Cancelado
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}>
                        {formatDate(item.createdAt)}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: item.expiryDate ? "#0f172a" : "#94a3b8", whiteSpace: "nowrap" }}>
                        {item.expiryDate || "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                          {item.status === "active" && (
                            <button
                              type="button"
                              className="fin-btn fin-btn--primary fin-btn--sm"
                              onClick={() => setSelectedForPayment(item)}
                              title="Abonar al apartado"
                            >
                              <Wallet size={14} />
                              <span>Abonar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="fin-btn fin-btn--ghost fin-btn--sm"
                            onClick={() => setSelectedDetailId(item.id)}
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                            <span>Detalle</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div
            style={{
              padding: "0.85rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--border-color)",
              fontSize: "0.85rem",
              background: "#fcfdfe",
            }}
          >
            <span>
              Mostrando página <strong>{page}</strong> de <strong>{totalPages}</strong> ({total} registros)
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="fin-btn fin-btn--ghost fin-btn--sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="fin-btn fin-btn--ghost fin-btn--sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nuevo Apartado */}
      <CreateLayawayModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSuccess={() => void loadData()}
      />

      {/* Modal Abonar */}
      {selectedForPayment && (
        <AddLayawayPaymentModal
          open={Boolean(selectedForPayment)}
          layaway={selectedForPayment}
          onClose={() => setSelectedForPayment(null)}
          onSuccess={() => {
            void loadData();
          }}
        />
      )}

      {/* Modal Detalle */}
      {selectedDetailId && (
        <LayawayDetailModal
          open={Boolean(selectedDetailId)}
          layawayId={selectedDetailId}
          onClose={() => setSelectedDetailId(null)}
          onAbonar={(layaway) => {
            setSelectedDetailId(null);
            setSelectedForPayment(layaway);
          }}
          onRefresh={() => void loadData()}
        />
      )}
    </div>
  );
}
