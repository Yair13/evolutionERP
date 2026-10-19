import { useCallback, useEffect, useState } from "react";
import {
  fetchCustomerCreditProfile,
  fetchReceivables,
  fetchWarehouseReceivablesReport,
  type CustomerCreditProfile,
  type ReceivableSummaryItem,
  type WarehouseReceivablesReport,
} from "../../api/finance.js";
import { fetchCustomers, type Customer } from "../../api/inventory.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { AddPaymentModal } from "../../components/finance/AddPaymentModal.js";
import { ReceivableDetailModal } from "../../components/finance/ReceivableDetailModal.js";
import {
  Building2,
  Clock,
  Receipt,
  RefreshCw,
  Search,
  User,
  Wallet,
  ArrowDownRight,
  TrendingUp,
} from "lucide-react";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

type TabMode = "credits" | "customer" | "report";

export function ReceivablesPage() {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();
  const canSeeAll = isAllWarehouses;

  const [activeTab, setActiveTab] = useState<TabMode>("credits");

  // Tab 1: Créditos
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? "" : warehouseId || ""
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [items, setItems] = useState<ReceivableSummaryItem[]>([]);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalPaid: 0,
    totalBalance: 0,
    countPending: 0,
    countPaid: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab 2: Ficha por cliente
  const [custSearch, setCustSearch] = useState("");
  const [custSuggestions, setCustSuggestions] = useState<Customer[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string | null>(null);
  const [custProfile, setCustProfile] = useState<CustomerCreditProfile | null>(null);
  const [custLoading, setCustLoading] = useState(false);

  // Tab 3: Reporte por sede
  const [reportData, setReportData] = useState<WarehouseReceivablesReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Modales
  const [activeReceivableForPayment, setActiveReceivableForPayment] = useState<ReceivableSummaryItem | null>(null);
  const [activeReceivableDetailId, setActiveReceivableDetailId] = useState<string | null>(null);

  // Carga de listado de créditos
  const loadCredits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReceivables(token, {
        warehouseId: selectedWarehouseId || undefined,
        status: (statusFilter as any) || "pending",
        q: searchQuery.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 50,
      });
      setItems(res.items);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || "Error al cargar créditos");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId, statusFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    if (activeTab === "credits") {
      void loadCredits();
    }
  }, [activeTab, loadCredits]);

  // Búsqueda en vivo de clientes
  useEffect(() => {
    if (!token || activeTab !== "customer" || custSearch.trim().length < 2) {
      setCustSuggestions([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await fetchCustomers(token, custSearch.trim());
        setCustSuggestions(res.items || []);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [custSearch, token, activeTab]);

  // Carga de ficha de cliente
  const loadCustomerProfile = useCallback(
    async (customerId: string) => {
      if (!token) return;
      setCustLoading(true);
      try {
        const profile = await fetchCustomerCreditProfile(token, customerId);
        setCustProfile(profile);
      } catch (err: any) {
        setError(err?.message || "Error al cargar cliente");
      } finally {
        setCustLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (activeTab === "customer" && selectedCustId) {
      void loadCustomerProfile(selectedCustId);
    }
  }, [activeTab, selectedCustId, loadCustomerProfile]);

  // Carga de reporte por sede
  const loadReport = useCallback(async () => {
    if (!token) return;
    setReportLoading(true);
    try {
      const rep = await fetchWarehouseReceivablesReport(token);
      setReportData(rep);
    } catch (err: any) {
      setError(err?.message || "Error al cargar reporte");
    } finally {
      setReportLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "report") {
      void loadReport();
    }
  }, [activeTab, loadReport]);

  return (
    <div className="fin-page">
      {/* Encabezado */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--indigo">
              <Wallet size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Cuentas por Cobrar · Cartera</h1>
              <p className="fin-header__subtitle">
                Control de créditos emitidos a clientes, abonos, cartera vencida y saldos a favor disponibles.
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas de navegación */}
        <div className="fin-header__actions">
          <div className="fin-tabs">
            <button
              type="button"
              className={`fin-tab ${activeTab === "credits" ? "is-active" : ""}`}
              onClick={() => setActiveTab("credits")}
            >
              <Receipt size={16} />
              <span>Todos los Créditos</span>
            </button>
            <button
              type="button"
              className={`fin-tab ${activeTab === "customer" ? "is-active" : ""}`}
              onClick={() => setActiveTab("customer")}
            >
              <User size={16} />
              <span>Ficha por Cliente</span>
            </button>
            <button
              type="button"
              className={`fin-tab ${activeTab === "report" ? "is-active" : ""}`}
              onClick={() => setActiveTab("report")}
            >
              <Building2 size={16} />
              <span>Reporte por Sede</span>
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────── TAB 1: LISTADO DE CRÉDITOS ────────────────── */}
      {activeTab === "credits" && (
        <>
          {/* Tarjetas KPI */}
          <div className="fin-kpi-grid fin-kpi-grid--4">
            <div className="fin-kpi-card fin-kpi-card--indigo">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Total Cartera Emitida</span>
                <div className="fin-kpi-icon fin-kpi-icon--indigo">
                  <Receipt size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--indigo">
                {formatMoney(summary.totalAmount)}
              </div>
              <div className="fin-kpi-sub">
                Total ventas a crédito registradas
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--emerald">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#059669" }}>Total Recaudado</span>
                <div className="fin-kpi-icon fin-kpi-icon--emerald">
                  <ArrowDownRight size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--emerald">
                {formatMoney(summary.totalPaid)}
              </div>
              <div className="fin-kpi-sub">
                Abonos iniciales y posteriores recibidos
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--rose">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#e11d48" }}>Saldo Pendiente por Cobrar</span>
                <div className="fin-kpi-icon fin-kpi-icon--rose">
                  <Clock size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--rose">
                {formatMoney(summary.totalBalance)}
              </div>
              <div className="fin-kpi-sub">
                {summary.countPending} créditos activos con saldo
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--teal">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Efectividad de Cobro</span>
                <div className="fin-kpi-icon fin-kpi-icon--teal">
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--teal">
                {summary.totalAmount > 0
                  ? `${Math.round((summary.totalPaid / summary.totalAmount) * 100)}%`
                  : "0%"}
              </div>
              <div className="fin-kpi-sub">
                {summary.countPending + summary.countPaid} créditos en historial
              </div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="fin-filter-card">
            {/* Buscador */}
            <div className="fin-filter-field" style={{ flex: 2, minWidth: 220 }}>
              <span>BUSCAR CRÉDITO</span>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por cliente, cédula o factura…"
                />
              </div>
            </div>

            {/* Sede selector (si admin) */}
            {canSeeAll ? (
              <div className="fin-filter-field" style={{ minWidth: 170 }}>
                <span>SEDE</span>
                <select
                  className="fin-select"
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                >
                  <option value="">Todas las Sedes</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="fin-filter-field" style={{ minWidth: 160 }}>
                <span>SEDE</span>
                <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)", fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-primary)" }}>
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
                </div>
              </div>
            )}

            {/* Estado */}
            <div className="fin-filter-field" style={{ minWidth: 160 }}>
              <span>ESTADO</span>
              <select
                className="fin-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="pending">Con Saldo (Pendientes)</option>
                <option value="all">Todos los Créditos</option>
                <option value="paid">Completamente Pagados</option>
              </select>
            </div>

            {/* Rango de Fechas */}
            <div className="fin-filter-field" style={{ minWidth: 130 }}>
              <span>DESDE</span>
              <input
                className="fin-input"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="fin-filter-field" style={{ minWidth: 130 }}>
              <span>HASTA</span>
              <input
                className="fin-input"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="fin-filter-field fin-filter-field--fixed">
              <button
                type="button"
                className="fin-btn fin-btn--ghost"
                onClick={() => void loadCredits()}
                title="Refrescar créditos"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                <span>Refrescar</span>
              </button>
            </div>
          </div>

          {/* Tabla de Créditos */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <Receipt size={18} color="var(--accent)" />
                <span>Facturas y Créditos Emitidos</span>
              </h3>
              <span className="fin-badge fin-badge--neutral">
                {items.length} registros listados
              </span>
            </div>

            {loading ? (
              <div className="fin-empty">
                <RefreshCw size={24} className="spin" />
                <h3 className="fin-empty__title">Cargando créditos</h3>
              </div>
            ) : error ? (
              <div className="fin-alert fin-alert--danger" style={{ margin: "1rem" }}>{error}</div>
            ) : items.length === 0 ? (
              <div className="fin-empty">
                <Receipt size={32} />
                <h3 className="fin-empty__title">No se encontraron créditos</h3>
                <p className="fin-empty__desc">Prueba cambiando los filtros o las fechas de búsqueda.</p>
              </div>
            ) : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Factura / Fecha</th>
                      {canSeeAll && <th>Sede</th>}
                      <th>Cliente</th>
                      <th style={{ textAlign: "right" }}>Total Venta</th>
                      <th style={{ textAlign: "right" }}>Abonado</th>
                      <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                      <th style={{ textAlign: "center" }}>Estado</th>
                      <th style={{ textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong style={{ color: "#0f172a" }}>{c.invoiceNumber}</strong>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {formatDate(c.createdAt)}
                          </div>
                        </td>
                        {canSeeAll && (
                          <td>
                            <span className="fin-badge fin-badge--neutral">
                              {c.warehouseCode}
                            </span>
                          </td>
                        )}
                        <td>
                          <strong style={{ display: "block", color: "#0f172a" }}>{c.customerName}</strong>
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            CC: {c.customerTaxId || "—"} · Tel: {c.customerPhone || "—"}
                          </span>
                        </td>
                        <td className="fin-table-num">
                          {formatMoney(c.totalAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669" }}>
                          {formatMoney(c.paidAmount)}
                        </td>
                        <td className="fin-table-num">
                          <strong style={{ color: c.balanceAmount > 0 ? "#e11d48" : "#059669", fontSize: "0.95rem" }}>
                            {formatMoney(c.balanceAmount)}
                          </strong>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={`fin-badge ${
                              c.status === "paid"
                                ? "fin-badge--success"
                                : c.status === "partial"
                                ? "fin-badge--warning"
                                : "fin-badge--danger"
                            }`}
                          >
                            {c.status === "paid" ? "Pagado" : c.status === "partial" ? "Parcial" : "Pendiente"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                            {c.balanceAmount > 0 && (
                              <button
                                type="button"
                                className="fin-btn fin-btn--primary fin-btn--sm"
                                onClick={() => setActiveReceivableForPayment(c)}
                              >
                                Abonar
                              </button>
                            )}
                            <button
                              type="button"
                              className="fin-btn fin-btn--ghost fin-btn--sm"
                              onClick={() => setActiveReceivableDetailId(c.id)}
                            >
                              Detalles
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ────────────────── TAB 2: FICHA POR CLIENTE ────────────────── */}
      {activeTab === "customer" && (
        <div>
          {/* Buscador de Cliente */}
          <div className="fin-filter-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.05rem", color: "#0f172a" }}>
              Buscar Cliente para Estado de Cuenta
            </h3>
            <div style={{ position: "relative", maxWidth: 540 }}>
              <div className="fin-search-wrap">
                <Search size={18} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  type="text"
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  placeholder="Escribe nombre, cédula o teléfono del cliente…"
                  style={{ height: 44 }}
                />
              </div>

              {custSuggestions.length > 0 && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    background: "#ffffff",
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    maxHeight: 240,
                    overflowY: "auto",
                    padding: "4px 0",
                    margin: "6px 0 0 0",
                    listStyle: "none",
                    boxShadow: "var(--fin-shadow-lg)",
                  }}
                >
                  {custSuggestions.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => {
                        setSelectedCustId(c.id);
                        setCustSearch(c.displayName);
                        setCustSuggestions([]);
                      }}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: "1px solid rgba(15, 23, 42, 0.05)",
                        fontSize: "0.88rem",
                        color: "#0f172a",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <strong>{c.displayName}</strong> · Cédula: {c.taxId || "—"} · Tel: {c.phone || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {custLoading ? (
            <div className="fin-empty">
              <RefreshCw size={24} className="spin" />
              <h3 className="fin-empty__title">Cargando ficha del cliente</h3>
            </div>
          ) : custProfile ? (
            <div>
              {/* Tarjetas resumen del cliente */}
              <div className="fin-kpi-grid">
                <div className="fin-kpi-card fin-kpi-card--indigo">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Ficha Cliente</span>
                    <div className="fin-kpi-icon fin-kpi-icon--indigo">
                      <User size={18} />
                    </div>
                  </div>
                  <strong style={{ fontSize: "1.25rem", color: "#0f172a", display: "block" }}>
                    {custProfile.customer.displayName}
                  </strong>
                  <div className="fin-kpi-sub">
                    CC/NIT: {custProfile.customer.taxId || "—"} · Tel: {custProfile.customer.phone || "—"}
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--rose">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#e11d48" }}>Deuda Actual Total</span>
                    <div className="fin-kpi-icon fin-kpi-icon--rose">
                      <Clock size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--rose">
                    {formatMoney(custProfile.stats.totalCurrentDebt)}
                  </div>
                  <div className="fin-kpi-sub">
                    {custProfile.stats.activeCreditsCount} crédito(s) con saldo pendiente
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--emerald">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#059669" }}>Saldo a Favor</span>
                    <div className="fin-kpi-icon fin-kpi-icon--emerald">
                      <Wallet size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--emerald">
                    {formatMoney(custProfile.customer.creditBalance)}
                  </div>
                  <div className="fin-kpi-sub">
                    Disponible para futuras compras o abonos
                  </div>
                </div>
              </div>

              {/* Facturas a crédito del cliente */}
              <div className="fin-table-card">
                <div className="fin-table-header">
                  <h3 className="fin-table-title">
                    <Receipt size={18} color="var(--accent)" />
                    <span>Créditos del Cliente ({custProfile.receivables.length})</span>
                  </h3>
                </div>

                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Sede</th>
                        <th>Fecha</th>
                        <th style={{ textAlign: "right" }}>Total Venta</th>
                        <th style={{ textAlign: "right" }}>Abonado</th>
                        <th style={{ textAlign: "right" }}>Saldo</th>
                        <th style={{ textAlign: "center" }}>Estado</th>
                        <th style={{ textAlign: "right" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custProfile.receivables.map((r) => (
                        <tr key={r.id}>
                          <td><strong>{r.invoiceNumber}</strong></td>
                          <td><span className="fin-badge fin-badge--neutral">{r.warehouseCode}</span></td>
                          <td style={{ color: "#64748b" }}>{formatDate(r.createdAt)}</td>
                          <td className="fin-table-num">{formatMoney(r.totalAmount)}</td>
                          <td className="fin-table-num" style={{ color: "#059669" }}>{formatMoney(r.paidAmount)}</td>
                          <td className="fin-table-num">
                            <strong style={{ color: r.balanceAmount > 0 ? "#e11d48" : "#059669" }}>
                              {formatMoney(r.balanceAmount)}
                            </strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span className={`fin-badge ${r.status === "paid" ? "fin-badge--success" : "fin-badge--danger"}`}>
                              {r.status === "paid" ? "Pagado" : "Pendiente"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {r.balanceAmount > 0 ? (
                              <button
                                type="button"
                                className="fin-btn fin-btn--primary fin-btn--sm"
                                onClick={() => setActiveReceivableForPayment(r)}
                              >
                                Abonar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="fin-btn fin-btn--ghost fin-btn--sm"
                                onClick={() => setActiveReceivableDetailId(r.id)}
                              >
                                Ver
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Abonos recientes del cliente */}
              <div className="fin-table-card">
                <div className="fin-table-header">
                  <h3 className="fin-table-title">
                    <Clock size={18} color="var(--accent)" />
                    <span>Historial de Abonos Recibidos ({custProfile.recentPayments.length})</span>
                  </h3>
                </div>

                {custProfile.recentPayments.length === 0 ? (
                  <div className="fin-empty" style={{ padding: "2rem" }}>
                    <p className="fin-empty__desc">No hay abonos registrados para este cliente.</p>
                  </div>
                ) : (
                  <div className="fin-table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Recibo</th>
                          <th>Factura</th>
                          <th>Fecha</th>
                          <th>Medio de Pago</th>
                          <th style={{ textAlign: "right" }}>Monto</th>
                          <th>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {custProfile.recentPayments.map((p) => (
                          <tr key={p.id}>
                            <td><strong>{p.receiptNumber}</strong></td>
                            <td>{p.invoiceNumber || "—"}</td>
                            <td style={{ color: "#64748b" }}>{formatDate(p.createdAt)}</td>
                            <td>
                              <span className="fin-badge fin-badge--neutral" style={{ textTransform: "capitalize" }}>
                                {p.paymentMethod}
                              </span>
                            </td>
                            <td className="fin-table-num" style={{ color: "#059669", fontWeight: 700 }}>
                              {formatMoney(p.amount)}
                              {p.excessToFavour > 0 && (
                                <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                  ({formatMoney(p.excessToFavour)} a favor)
                                </div>
                              )}
                            </td>
                            <td style={{ color: "#64748b" }}>{p.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="fin-empty">
              <User size={32} />
              <h3 className="fin-empty__title">Selecciona un cliente</h3>
              <p className="fin-empty__desc">Busca por nombre, cédula o teléfono arriba para consultar el estado de cuenta consolidado.</p>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 3: REPORTE POR SEDES ────────────────── */}
      {activeTab === "report" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#0f172a", fontWeight: 700 }}>
              Cartera y Recaudos Consolidados por Sede
            </h3>
            <button
              type="button"
              className="fin-btn fin-btn--ghost fin-btn--sm"
              onClick={() => void loadReport()}
            >
              <RefreshCw size={14} className={reportLoading ? "spin" : ""} />
              <span>Refrescar</span>
            </button>
          </div>

          {reportLoading ? (
            <div className="fin-empty">
              <RefreshCw size={24} className="spin" />
              <h3 className="fin-empty__title">Cargando consolidado de sedes</h3>
            </div>
          ) : reportData ? (
            <div className="fin-table-card">
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Sede</th>
                      <th style={{ textAlign: "center" }}>Créditos Activos</th>
                      <th style={{ textAlign: "right" }}>Saldo Cartera Pendiente</th>
                      <th style={{ textAlign: "right" }}>Recaudado Hoy</th>
                      <th style={{ textAlign: "right" }}>Recaudado Este Mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.warehouses.map((w) => (
                      <tr key={w.warehouseId}>
                        <td>
                          <strong>{w.warehouseName}</strong> ({w.warehouseCode})
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="fin-badge fin-badge--neutral">
                            {w.activeCreditsCount}
                          </span>
                        </td>
                        <td className="fin-table-num" style={{ fontWeight: 800, color: w.totalBalance > 0 ? "#e11d48" : "#059669" }}>
                          {formatMoney(w.totalBalance)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669", fontWeight: 600 }}>
                          {formatMoney(w.collectedToday)}
                        </td>
                        <td className="fin-table-num" style={{ fontWeight: 600 }}>
                          {formatMoney(w.collectedMonth)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>TOTAL EMPRESA</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="fin-badge fin-badge--teal">{reportData.totals.activeCreditsCount}</span>
                      </td>
                      <td className="fin-table-num" style={{ color: "#e11d48", fontSize: "1.05rem" }}>
                        {formatMoney(reportData.totals.totalBalance)}
                      </td>
                      <td className="fin-table-num" style={{ color: "#059669" }}>
                        {formatMoney(reportData.totals.collectedToday)}
                      </td>
                      <td className="fin-table-num">
                        {formatMoney(reportData.totals.collectedMonth)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Modal para Registrar Abono */}
      {activeReceivableForPayment && (
        <AddPaymentModal
          open={Boolean(activeReceivableForPayment)}
          receivable={activeReceivableForPayment}
          onClose={() => setActiveReceivableForPayment(null)}
          onSuccess={() => {
            void loadCredits();
            if (selectedCustId) void loadCustomerProfile(selectedCustId);
            if (activeTab === "report") void loadReport();
          }}
        />
      )}

      {/* Modal para Detalle de Crédito */}
      {activeReceivableDetailId && (
        <ReceivableDetailModal
          open={Boolean(activeReceivableDetailId)}
          receivableId={activeReceivableDetailId}
          onClose={() => setActiveReceivableDetailId(null)}
          onOpenAddPayment={(detail) => {
            setActiveReceivableDetailId(null);
            setActiveReceivableForPayment(detail);
          }}
        />
      )}
    </div>
  );
}
