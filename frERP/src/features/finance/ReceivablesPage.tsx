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
  const { token, user } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();
  const canSeeAll = isAllWarehouses || user?.roles.includes("super_admin") || user?.roles.includes("secretaria");

  const [activeTab, setActiveTab] = useState<TabMode>("credits");

  // Tab 1: Créditos
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? "" : warehouseId || ""
  );
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

  // Modales
  const [activeReceivableForPayment, setActiveReceivableForPayment] = useState<ReceivableSummaryItem | null>(null);
  const [activeReceivableDetailId, setActiveReceivableDetailId] = useState<string | null>(null);

  // Tab 2: Ficha por Cliente
  const [custSearch, setCustSearch] = useState("");
  const [custSuggestions, setCustSuggestions] = useState<Customer[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string | null>(null);
  const [custProfile, setCustProfile] = useState<CustomerCreditProfile | null>(null);
  const [custLoading, setCustLoading] = useState(false);

  // Tab 3: Reporte por Sede
  const [reportData, setReportData] = useState<WarehouseReceivablesReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Carga de Créditos
  const loadCredits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReceivables(token, {
        warehouseId: selectedWarehouseId || undefined,
        status: statusFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        q: searchQuery.trim() || undefined,
      });
      setItems(res.items);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || "Error al cargar cartera");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId, statusFilter, dateFrom, dateTo, searchQuery]);

  useEffect(() => {
    if (activeTab === "credits") {
      void loadCredits();
    }
  }, [activeTab, loadCredits]);

  // Carga de sugerencias de clientes para Tab 2
  useEffect(() => {
    if (activeTab !== "customer" || !token || !custSearch.trim() || custSearch.length < 2) {
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
    <div className="container" style={{ paddingBottom: "3rem" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.25rem 0", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Wallet size={28} className="text-primary" />
            Cuentas por Cobrar · Cartera
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Control de créditos emitidos, abonos de clientes y saldos a favor
          </p>
        </div>

        {/* Pestañas de navegación */}
        <div style={{ display: "flex", background: "var(--bg-card-subtle, rgba(255,255,255,0.05))", padding: 4, borderRadius: 8, border: "1px solid var(--border-color, rgba(255,255,255,0.08))" }}>
          <button
            type="button"
            className={`inv-btn ${activeTab === "credits" ? "inv-btn--primary" : "inv-btn--ghost"}`}
            style={{ fontSize: "0.85rem", padding: "6px 14px", borderRadius: 6 }}
            onClick={() => setActiveTab("credits")}
          >
            <Receipt size={16} style={{ marginRight: 6 }} /> Todos los Créditos
          </button>
          <button
            type="button"
            className={`inv-btn ${activeTab === "customer" ? "inv-btn--primary" : "inv-btn--ghost"}`}
            style={{ fontSize: "0.85rem", padding: "6px 14px", borderRadius: 6 }}
            onClick={() => setActiveTab("customer")}
          >
            <User size={16} style={{ marginRight: 6 }} /> Ficha por Cliente
          </button>
          <button
            type="button"
            className={`inv-btn ${activeTab === "report" ? "inv-btn--primary" : "inv-btn--ghost"}`}
            style={{ fontSize: "0.85rem", padding: "6px 14px", borderRadius: 6 }}
            onClick={() => setActiveTab("report")}
          >
            <Building2 size={16} style={{ marginRight: 6 }} /> Reporte por Sede
          </button>
        </div>
      </div>

      {/* ────────────────── TAB 1: LISTADO DE CRÉDITOS ────────────────── */}
      {activeTab === "credits" && (
        <>
          {/* Tarjetas KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
            <div style={{ background: "var(--bg-card, rgba(255,255,255,0.03))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, padding: "1rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Total Cartera Emitida</span>
              <strong style={{ fontSize: "1.35rem" }}>{formatMoney(summary.totalAmount)}</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                Total ventas a crédito registradas
              </div>
            </div>

            <div style={{ background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 10, padding: "1rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#10b981", display: "block" }}>Total Recaudado</span>
              <strong style={{ fontSize: "1.35rem", color: "#10b981" }}>{formatMoney(summary.totalPaid)}</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                Abonos iniciales y posteriores recibidos
              </div>
            </div>

            <div style={{ background: summary.totalBalance > 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.06)", border: `1px solid ${summary.totalBalance > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.2)"}`, borderRadius: 10, padding: "1rem" }}>
              <span style={{ fontSize: "0.8rem", color: summary.totalBalance > 0 ? "#ef4444" : "#10b981", display: "block" }}>Saldo Pendiente por Cobrar</span>
              <strong style={{ fontSize: "1.35rem", color: summary.totalBalance > 0 ? "#ef4444" : "#10b981" }}>
                {formatMoney(summary.totalBalance)}
              </strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                {summary.countPending} créditos activos
              </div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div style={{ background: "var(--bg-card-subtle, rgba(255,255,255,0.03))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            {/* Buscador */}
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por cliente, cédula o factura…"
                style={{ paddingLeft: "2rem", width: "100%", height: 38 }}
              />
            </div>

            {/* Sede selector (si admin) */}
            {canSeeAll && (
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                style={{ height: 38, minWidth: 160 }}
              >
                <option value="">Todas las Sedes</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            )}

            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: 38, minWidth: 150 }}
            >
              <option value="pending">Con Saldo (Pendientes)</option>
              <option value="all">Todos los Créditos</option>
              <option value="paid">Completamente Pagados</option>
            </select>

            {/* Rango de Fechas */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Fecha desde"
                style={{ height: 38 }}
              />
              <span style={{ color: "var(--text-muted)" }}>a</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Fecha hasta"
                style={{ height: 38 }}
              />
            </div>

            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              style={{ height: 38, padding: "0 12px" }}
              onClick={() => void loadCredits()}
              title="Refrescar"
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>

          {/* Tabla de Créditos */}
          <div style={{ background: "var(--bg-card, rgba(255,255,255,0.02))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                Cargando listado de créditos…
              </div>
            ) : error ? (
              <div style={{ padding: "2rem", color: "#ef4444", textAlign: "center" }}>{error}</div>
            ) : items.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                No se encontraron créditos con los filtros seleccionados.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left", borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.08))" }}>
                      <th style={{ padding: "10px 14px" }}>Factura / Fecha</th>
                      {canSeeAll && <th style={{ padding: "10px 14px" }}>Sede</th>}
                      <th style={{ padding: "10px 14px" }}>Cliente</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Total Venta</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Abonado</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Saldo Pendiente</th>
                      <th style={{ padding: "10px 14px", textAlign: "center" }}>Estado</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr
                        key={c.id}
                        style={{ borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}
                      >
                        <td style={{ padding: "10px 14px" }}>
                          <strong style={{ color: "var(--text-primary)" }}>{c.invoiceNumber}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {formatDate(c.createdAt)}
                          </div>
                        </td>
                        {canSeeAll && (
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: "0.82rem", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                              {c.warehouseCode}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: "10px 14px" }}>
                          <strong style={{ display: "block" }}>{c.customerName}</strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            CC: {c.customerTaxId || "—"} · Tel: {c.customerPhone || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>
                          {formatMoney(c.totalAmount)}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>
                          {formatMoney(c.paidAmount)}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <strong style={{ color: c.balanceAmount > 0 ? "#ef4444" : "#10b981", fontSize: "0.95rem" }}>
                            {formatMoney(c.balanceAmount)}
                          </strong>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: 6,
                              background:
                                c.status === "paid"
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : c.status === "partial"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(239, 68, 68, 0.15)",
                              color:
                                c.status === "paid"
                                  ? "#10b981"
                                  : c.status === "partial"
                                  ? "#f59e0b"
                                  : "#ef4444",
                            }}
                          >
                            {c.status === "paid" ? "Pagado" : c.status === "partial" ? "Parcial" : "Pendiente"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
                            {c.balanceAmount > 0 && (
                              <button
                                type="button"
                                className="inv-btn inv-btn--primary"
                                style={{ fontSize: "0.78rem", padding: "4px 8px" }}
                                onClick={() => setActiveReceivableForPayment(c)}
                              >
                                Abonar
                              </button>
                            )}
                            <button
                              type="button"
                              className="inv-btn inv-btn--ghost"
                              style={{ fontSize: "0.78rem", padding: "4px 8px" }}
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
          <div style={{ background: "var(--bg-card-subtle, rgba(255,255,255,0.03))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.05rem" }}>Buscar Cliente para Estado de Cuenta</h3>
            <div style={{ position: "relative", maxWidth: 500 }}>
              <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                placeholder="Escribe nombre, cédula o teléfono del cliente…"
                style={{ paddingLeft: "2.4rem", width: "100%", height: 42 }}
              />
              {custSuggestions.length > 0 && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    background: "var(--bg-card, #1e293b)",
                    border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
                    borderRadius: 6,
                    maxHeight: 220,
                    overflowY: "auto",
                    padding: 0,
                    margin: "4px 0 0 0",
                    listStyle: "none",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
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
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        fontSize: "0.88rem",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
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
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Cargando historial del cliente…
            </div>
          ) : custProfile ? (
            <div>
              {/* Tarjetas resumen del cliente */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ background: "var(--bg-card, rgba(255,255,255,0.03))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, padding: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Cliente</div>
                  <strong style={{ fontSize: "1.2rem", display: "block" }}>{custProfile.customer.displayName}</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    CC / NIT: {custProfile.customer.taxId || "—"} · Tel: {custProfile.customer.phone || "—"}
                  </div>
                </div>

                <div style={{ background: custProfile.stats.totalCurrentDebt > 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)", border: `1px solid ${custProfile.stats.totalCurrentDebt > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)"}`, borderRadius: 10, padding: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: custProfile.stats.totalCurrentDebt > 0 ? "#ef4444" : "#10b981" }}>Deuda Actual Total</div>
                  <strong style={{ fontSize: "1.35rem", color: custProfile.stats.totalCurrentDebt > 0 ? "#ef4444" : "#10b981" }}>
                    {formatMoney(custProfile.stats.totalCurrentDebt)}
                  </strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {custProfile.stats.activeCreditsCount} crédito(s) con saldo
                  </div>
                </div>

                <div style={{ background: custProfile.customer.creditBalance > 0 ? "rgba(16, 185, 129, 0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${custProfile.customer.creditBalance > 0 ? "rgba(16, 185, 129, 0.35)" : "var(--border-color, rgba(255,255,255,0.08))"}`, borderRadius: 10, padding: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "#10b981" }}>Saldo a Favor del Cliente</div>
                  <strong style={{ fontSize: "1.35rem", color: "#10b981" }}>
                    {formatMoney(custProfile.customer.creditBalance)}
                  </strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Disponible para futuras compras o abonos
                  </div>
                </div>
              </div>

              {/* Facturas a crédito del cliente */}
              <div style={{ marginBottom: "2rem" }}>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Receipt size={18} /> Créditos del Cliente ({custProfile.receivables.length})
                </h3>
                <div style={{ background: "var(--bg-card, rgba(255,255,255,0.02))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                        <th style={{ padding: "8px 12px" }}>Factura</th>
                        <th style={{ padding: "8px 12px" }}>Sede</th>
                        <th style={{ padding: "8px 12px" }}>Fecha</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Total Venta</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Abonado</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Saldo</th>
                        <th style={{ padding: "8px 12px", textAlign: "center" }}>Estado</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custProfile.receivables.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.invoiceNumber}</td>
                          <td style={{ padding: "8px 12px" }}>{r.warehouseCode}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{formatDate(r.createdAt)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatMoney(r.totalAmount)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: "#10b981" }}>{formatMoney(r.paidAmount)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: r.balanceAmount > 0 ? "#ef4444" : "#10b981" }}>
                            {formatMoney(r.balanceAmount)}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "center" }}>
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, background: r.status === "paid" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: r.status === "paid" ? "#10b981" : "#ef4444" }}>
                              {r.status === "paid" ? "Pagado" : "Pendiente"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>
                            {r.balanceAmount > 0 ? (
                              <button
                                type="button"
                                className="inv-btn inv-btn--primary"
                                style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                onClick={() => setActiveReceivableForPayment(r)}
                              >
                                Abonar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="inv-btn inv-btn--ghost"
                                style={{ fontSize: "0.75rem", padding: "3px 8px" }}
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
              <div>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Clock size={18} /> Historial de Abonos Recibidos ({custProfile.recentPayments.length})
                </h3>
                {custProfile.recentPayments.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No hay abonos registrados para este cliente.</p>
                ) : (
                  <div style={{ background: "var(--bg-card, rgba(255,255,255,0.02))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                          <th style={{ padding: "8px 12px" }}>Recibo</th>
                          <th style={{ padding: "8px 12px" }}>Factura</th>
                          <th style={{ padding: "8px 12px" }}>Fecha</th>
                          <th style={{ padding: "8px 12px" }}>Medio de Pago</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Monto</th>
                          <th style={{ padding: "8px 12px" }}>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {custProfile.recentPayments.map((p) => (
                          <tr key={p.id} style={{ borderTop: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 600 }}>{p.receiptNumber}</td>
                            <td style={{ padding: "8px 12px" }}>{p.invoiceNumber || "—"}</td>
                            <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{formatDate(p.createdAt)}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ textTransform: "capitalize", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                                {p.paymentMethod}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>
                              {formatMoney(p.amount)}
                              {p.excessToFavour > 0 && (
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                  ({formatMoney(p.excessToFavour)} a saldo a favor)
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{p.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Busca y selecciona un cliente arriba para ver todo su estado de cuenta.
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 3: REPORTE POR SEDES ────────────────── */}
      {activeTab === "report" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Cartera y Recaudos Consolidados por Sede</h3>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              onClick={() => void loadReport()}
              style={{ fontSize: "0.85rem", padding: "4px 10px" }}
            >
              <RefreshCw size={14} className={reportLoading ? "spin" : ""} style={{ marginRight: 6 }} /> Refrescar
            </button>
          </div>

          {reportLoading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Cargando consolidado de sedes…
            </div>
          ) : reportData ? (
            <div style={{ background: "var(--bg-card, rgba(255,255,255,0.02))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px" }}>Sede</th>
                    <th style={{ padding: "12px 16px", textAlign: "center" }}>Créditos Activos</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Saldo Cartera Pendiente</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Recaudado Hoy</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Recaudado Este Mes</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.warehouses.map((w) => (
                    <tr key={w.warehouseId} style={{ borderTop: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <strong>{w.warehouseName}</strong> ({w.warehouseCode})
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span style={{ padding: "2px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 6, fontWeight: 600 }}>
                          {w.activeCreditsCount}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: w.totalBalance > 0 ? "#ef4444" : "#10b981" }}>
                        {formatMoney(w.totalBalance)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>
                        {formatMoney(w.collectedToday)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>
                        {formatMoney(w.collectedMonth)}
                      </td>
                    </tr>
                  ))}
                  {/* Fila de Totales */}
                  <tr style={{ background: "rgba(255,255,255,0.06)", borderTop: "2px solid var(--border-color, rgba(255,255,255,0.15))", fontWeight: 800 }}>
                    <td style={{ padding: "12px 16px" }}>TOTAL EMPRESA</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>{reportData.totals.activeCreditsCount}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#ef4444" }}>
                      {formatMoney(reportData.totals.totalBalance)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#10b981" }}>
                      {formatMoney(reportData.totals.collectedToday)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {formatMoney(reportData.totals.collectedMonth)}
                    </td>
                  </tr>
                </tbody>
              </table>
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
