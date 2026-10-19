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
import {
  Bookmark,
  PlusCircle,
  Search,
  Wallet,
  Eye,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function LayawaysPage() {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, setWarehouseId } = useWarehouse();

  // Filtros
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(warehouseId || "");
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
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchLayaways(token, {
        warehouseId: selectedWarehouse || null,
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
  }, [token, selectedWarehouse, selectedStatus, searchQuery, dateFrom, dateTo, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="inv-page">
      {/* Header */}
      <div className="inv-page__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Bookmark size={28} color="#6366f1" />
            <h1 className="inv-page__title">Plan Separe / Apartados</h1>
          </div>
          <p className="inv-page__subtitle">
            Control de abonos de clientes para apartar mercancía, liquidación en caja y saldos a favor.
          </p>
        </div>

        <button
          type="button"
          className="inv-btn inv-btn--primary"
          onClick={() => setOpenCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <PlusCircle size={18} />
          Nuevo Apartado
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          margin: "1.5rem 0",
        }}
      >
        <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
            <span>Apartados Activos</span>
            <Bookmark size={18} color="#6366f1" />
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}>
            {summary.activeCount}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
            Clientes con mercancía reservada
          </div>
        </div>

        <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
            <span>Total Mercancía Apartada</span>
            <Clock size={18} color="#818cf8" />
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}>
            {formatMoney(summary.totalTarget)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
            Valor total de planes activos
          </div>
        </div>

        <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
            <span>Total Recaudado en Abonos</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#10b981", marginTop: "0.5rem" }}>
            {formatMoney(summary.totalCollected)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
            Dinero recibido en caja
          </div>
        </div>

        <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
            <span>Saldo Pendiente por Recaudar</span>
            <Wallet size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f59e0b", marginTop: "0.5rem" }}>
            {formatMoney(summary.totalRemaining)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
            Por cobrar antes de entrega
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div
        style={{
          background: "var(--inv-bg-elevated)",
          padding: "1rem",
          borderRadius: 8,
          marginBottom: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        {/* Sede */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 160 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>SEDE</span>
          <select
            value={selectedWarehouse}
            onChange={(e) => {
              setSelectedWarehouse(e.target.value);
              setWarehouseId(e.target.value);
              setPage(1);
            }}
            disabled={!user?.hasAdminAccess && warehouses.length <= 1}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
          >
            <option value="">Todas las sedes</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </label>

        {/* Estado */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 140 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>ESTADO</span>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="completed">Completados / Redimidos</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </label>

        {/* Búsqueda */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>BUSCAR CLIENTE O CÓDIGO</span>
          <div style={{ position: "relative" }}>
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por código, nombre, cédula o teléfono..."
              style={{ width: "100%", padding: "6px 10px 6px 30px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
            />
            <Search size={15} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--inv-text-muted)" }} />
          </div>
        </label>

        {/* Fechas */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>DESDE</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>HASTA</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
          />
        </label>
      </div>

      {error && <div className="inv-form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {/* Tabla de Resultados */}
      <div style={{ background: "var(--inv-bg-elevated)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--inv-border)" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="inv-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Sede</th>
                <th>Meta</th>
                <th>Abonado</th>
                <th>Saldo Pendiente</th>
                <th>Estado</th>
                <th>Fecha Creación</th>
                <th>Vencimiento</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "2rem", color: "var(--inv-text-muted)" }}>
                    Cargando apartados...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--inv-text-muted)" }}>
                    <Filter size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
                    <div>No se encontraron apartados con los filtros seleccionados.</div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "#818cf8" }}>{item.code}</strong>
                    </td>
                    <td>
                      <div>
                        <strong>{item.customerName}</strong>
                        <div style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>
                          CC: {item.customerTaxId || "—"} · Tel: {item.customerPhone || "—"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{item.warehouseName}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {formatMoney(item.targetAmount)}
                    </td>
                    <td style={{ fontWeight: 700, color: "#10b981" }}>
                      {formatMoney(item.paidAmount)}
                    </td>
                    <td style={{ fontWeight: 700, color: item.remainingAmount === 0 ? "#10b981" : "#f59e0b" }}>
                      {formatMoney(item.remainingAmount)}
                    </td>
                    <td>
                      {item.status === "active" && (
                        <span className="badge badge--primary" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}>
                          Activo
                        </span>
                      )}
                      {item.status === "completed" && (
                        <span className="badge badge--success" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                          Redimido
                        </span>
                      )}
                      {item.status === "cancelled" && (
                        <span className="badge badge--neutral" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
                          Cancelado
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)" }}>
                      {formatDate(item.createdAt)}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: item.expiryDate ? "inherit" : "var(--inv-text-muted)" }}>
                      {item.expiryDate || "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                        {item.status === "active" && (
                          <button
                            type="button"
                            className="inv-btn inv-btn--primary"
                            style={{ padding: "4px 8px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 3 }}
                            onClick={() => setSelectedForPayment(item)}
                            title="Abonar al apartado"
                          >
                            <Wallet size={14} />
                            Abonar
                          </button>
                        )}
                        <button
                          type="button"
                          className="inv-btn inv-btn--ghost"
                          style={{ padding: "4px 8px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => setSelectedDetailId(item.id)}
                          title="Ver detalle"
                        >
                          <Eye size={14} />
                          Detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div
            style={{
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--inv-border)",
              fontSize: "0.85rem",
            }}
          >
            <span>
              Mostrando página <strong>{page}</strong> de <strong>{totalPages}</strong> ({total} registros)
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
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
