import { useState, useEffect, useCallback } from "react";
import {
  fetchPayables,
  fetchSuppliers,
  type PayableSummaryItem,
  type SupplierItem,
  type PayableStatus,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { formatBogotaDate } from "../../lib/dateUtils.js";
import { CreateSupplierModal } from "../../components/finance/CreateSupplierModal.js";
import { CreatePayableModal } from "../../components/finance/CreatePayableModal.js";
import { AddPayablePaymentModal } from "../../components/finance/AddPayablePaymentModal.js";
import { PayableDetailModal } from "../../components/finance/PayableDetailModal.js";
import {
  Truck,
  PlusCircle,
  Search,
  Wallet,
  Eye,
  CheckCircle2,
  Clock,
  Building2,
  Calendar,
  CreditCard,
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

export function PayablesPage() {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses, loading: whLoading } = useWarehouse();

  const [activeTab, setActiveTab] = useState<"payables" | "suppliers">("payables");

  // Filtros de Cuentas por Pagar
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouse(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [selectedStatus, setSelectedStatus] = useState<string>("open");
  const [searchPayables, setSearchPayables] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");

  // Datos Cuentas por Pagar
  const [payables, setPayables] = useState<PayableSummaryItem[]>([]);
  const [totalPayables, setTotalPayables] = useState(0);
  const [payablesPage, setPayablesPage] = useState(1);
  const limit = 25;

  const [payablesSummary, setPayablesSummary] = useState({
    totalBilled: 0,
    totalPaid: 0,
    totalBalance: 0,
    openCount: 0,
    paidCount: 0,
  });

  // Datos Proveedores
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [searchSuppliers, setSearchSuppliers] = useState("");
  const [suppliersPage, setSuppliersPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [openCreateSupplier, setOpenCreateSupplier] = useState(false);
  const [openCreatePayable, setOpenCreatePayable] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState<PayableSummaryItem | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  // Cargar Cuentas por Pagar
  const loadPayables = useCallback(async () => {
    if (!token || whLoading) return;
    if (!isAllWarehouses && !warehouseId) return;

    setLoading(true);
    setError(null);
    try {
      const targetWh = isAllWarehouses ? (selectedWarehouse || null) : (warehouseId || null);
      const res = await fetchPayables(token, {
        warehouseId: targetWh,
        status: selectedStatus === "all" ? null : (selectedStatus as PayableStatus),
        dueDateFrom: dueDateFrom || null,
        dueDateTo: dueDateTo || null,
        q: searchPayables.trim() || null,
        limit,
        offset: (payablesPage - 1) * limit,
      });
      setPayables(res.items);
      setTotalPayables(res.total);
      setPayablesSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar cuentas por pagar.");
    } finally {
      setLoading(false);
    }
  }, [token, isAllWarehouses, warehouseId, selectedWarehouse, selectedStatus, dueDateFrom, dueDateTo, searchPayables, payablesPage]);

  // Cargar Proveedores
  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSuppliers(token, {
        q: searchSuppliers.trim() || null,
        limit: 50,
        offset: (suppliersPage - 1) * 50,
      });
      setSuppliers(res.items);
      setTotalSuppliers(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar proveedores.");
    } finally {
      setLoading(false);
    }
  }, [token, searchSuppliers, suppliersPage]);

  useEffect(() => {
    if (activeTab === "payables") {
      void loadPayables();
    } else {
      void loadSuppliers();
    }
  }, [activeTab, loadPayables, loadSuppliers]);

  const totalCompanyCreditWithSuppliers = suppliers.reduce((s, sup) => s + (sup.creditBalance || 0), 0);
  const totalPayablesPages = Math.ceil(totalPayables / limit) || 1;

  return (
    <div className="fin-page">
      {/* Header */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--amber">
              <Truck size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Proveedores y Cuentas por Pagar</h1>
              <p className="fin-header__subtitle">
                Gestión de proveedores, facturas de compra a crédito, programación de pagos y saldos a favor.
              </p>
            </div>
          </div>
        </div>

        <div className="fin-header__actions">
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => setOpenCreateSupplier(true)}
          >
            <PlusCircle size={17} />
            <span>Nuevo Proveedor</span>
          </button>
          <button
            type="button"
            className="fin-btn fin-btn--primary"
            onClick={() => setOpenCreatePayable(true)}
          >
            <PlusCircle size={17} />
            <span>Registrar Factura / Deuda</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="fin-tabs">
          <button
            type="button"
            className={`fin-tab ${activeTab === "payables" ? "is-active" : ""}`}
            onClick={() => setActiveTab("payables")}
          >
            <Truck size={16} />
            <span>Cuentas por Pagar (Facturas y Deudas)</span>
          </button>
          <button
            type="button"
            className={`fin-tab ${activeTab === "suppliers" ? "is-active" : ""}`}
            onClick={() => setActiveTab("suppliers")}
          >
            <Building2 size={16} />
            <span>Directorio de Proveedores</span>
            {totalSuppliers > 0 && <span className="fin-tab__badge">{totalSuppliers}</span>}
          </button>
        </div>
      </div>

      {activeTab === "payables" && (
        <>
          {/* KPI Summary Cards */}
          <div className="fin-kpi-grid fin-kpi-grid--4">
            <div className="fin-kpi-card fin-kpi-card--amber">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#d97706" }}>Deuda Total Pendiente</span>
                <div className="fin-kpi-icon fin-kpi-icon--amber">
                  <Clock size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--amber">
                {formatMoney(payablesSummary.totalBalance)}
              </div>
              <div className="fin-kpi-sub">
                {payablesSummary.openCount} factura(s) por pagar
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--indigo">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Total Facturado</span>
                <div className="fin-kpi-icon fin-kpi-icon--indigo">
                  <Truck size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--indigo">
                {formatMoney(payablesSummary.totalBilled)}
              </div>
              <div className="fin-kpi-sub">
                Valor acumulado de compras
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--emerald">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#059669" }}>Total Pagado</span>
                <div className="fin-kpi-icon fin-kpi-icon--emerald">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--emerald">
                {formatMoney(payablesSummary.totalPaid)}
              </div>
              <div className="fin-kpi-sub">
                Salidas de dinero registradas
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--teal">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "var(--accent)" }}>Saldo a Favor Empresa</span>
                <div className="fin-kpi-icon fin-kpi-icon--teal">
                  <Wallet size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--teal">
                {formatMoney(totalCompanyCreditWithSuppliers)}
              </div>
              <div className="fin-kpi-sub">
                Excedentes listos para usar
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="fin-filter-card">
            {isAllWarehouses ? (
              <div className="fin-filter-field" style={{ minWidth: 170 }}>
                <span>SEDE / BODEGA</span>
                <select
                  className="fin-select"
                  value={selectedWarehouse}
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setPayablesPage(1);
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
            <div className="fin-filter-field" style={{ minWidth: 160 }}>
              <span>ESTADO</span>
              <select
                className="fin-select"
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPayablesPage(1);
                }}
              >
                <option value="open">Pendientes / Con Saldo</option>
                <option value="paid">Pagadas al 100%</option>
                <option value="all">Todas las Facturas</option>
              </select>
            </div>

            {/* Búsqueda */}
            <div className="fin-filter-field" style={{ flex: 2, minWidth: 220 }}>
              <span>BUSCAR FACTURA O PROVEEDOR</span>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  value={searchPayables}
                  onChange={(e) => {
                    setSearchPayables(e.target.value);
                    setPayablesPage(1);
                  }}
                  placeholder="N° factura, proveedor, concepto..."
                />
              </div>
            </div>

            {/* Vencimiento Desde / Hasta */}
            <div className="fin-filter-field" style={{ minWidth: 130 }}>
              <span>VENCE DESDE</span>
              <input
                className="fin-input"
                type="date"
                value={dueDateFrom}
                onChange={(e) => {
                  setDueDateFrom(e.target.value);
                  setPayablesPage(1);
                }}
              />
            </div>

            <div className="fin-filter-field" style={{ minWidth: 130 }}>
              <span>VENCE HASTA</span>
              <input
                className="fin-input"
                type="date"
                value={dueDateTo}
                onChange={(e) => {
                  setDueDateTo(e.target.value);
                  setPayablesPage(1);
                }}
              />
            </div>

            <div className="fin-filter-field fin-filter-field--fixed">
              <button
                type="button"
                className="fin-btn fin-btn--ghost"
                onClick={() => void loadPayables()}
                title="Refrescar cuentas por pagar"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                <span>Refrescar</span>
              </button>
            </div>
          </div>

          {error && <div className="fin-alert fin-alert--danger">{error}</div>}

          {/* Tabla Cuentas por Pagar */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <Truck size={18} color="var(--accent)" />
                <span>Facturas y Deudas con Proveedores</span>
              </h3>
              <span className="fin-badge fin-badge--neutral">
                {totalPayables} facturas
              </span>
            </div>

            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Factura / N°</th>
                    <th>Proveedor</th>
                    <th>Sede</th>
                    <th>Concepto</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>Pagado</th>
                    <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                    <th style={{ textAlign: "center" }}>Estado</th>
                    <th>Vencimiento</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                        <RefreshCw size={24} className="spin" style={{ margin: "0 auto 0.5rem" }} />
                        <div>Cargando cuentas por pagar…</div>
                      </td>
                    </tr>
                  ) : payables.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                        <Filter size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>No se encontraron cuentas por pagar</div>
                        <div style={{ fontSize: "0.82rem", marginTop: 4 }}>Ajusta los filtros de búsqueda o registra una factura nueva.</div>
                      </td>
                    </tr>
                  ) : (
                    payables.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong style={{ color: "#0f172a" }}>{item.billNumber || "S/N"}</strong>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {formatDate(item.issueDate || item.createdAt)}
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong style={{ color: "#0f172a" }}>{item.supplierName}</strong>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              NIT: {item.supplierTaxId || "—"}
                            </div>
                          </div>
                        </td>
                        <td>{item.warehouseName}</td>
                        <td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.description || ""}>
                          {item.description || "—"}
                        </td>
                        <td className="fin-table-num">{formatMoney(item.totalAmount)}</td>
                        <td className="fin-table-num" style={{ color: "#059669" }}>{formatMoney(item.paidAmount)}</td>
                        <td className="fin-table-num">
                          <strong style={{ color: item.balanceAmount === 0 ? "#059669" : "#d97706", fontSize: "0.95rem" }}>
                            {formatMoney(item.balanceAmount)}
                          </strong>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={`fin-badge ${
                              item.status === "paid"
                                ? "fin-badge--success"
                                : item.status === "partial"
                                ? "fin-badge--info"
                                : "fin-badge--warning"
                            }`}
                          >
                            {item.status === "open" ? "Pendiente" : item.status === "partial" ? "Abonado" : "Pagada"}
                          </span>
                        </td>
                        <td>
                          {item.dueDate ? (
                            <div style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem", color: "#64748b" }}>
                              <Calendar size={13} />
                              {item.dueDate}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                            {item.status !== "paid" && item.status !== "cancelled" && (
                              <button
                                type="button"
                                className="fin-btn fin-btn--primary fin-btn--sm"
                                onClick={() => setSelectedForPayment(item)}
                                title="Registrar egreso / pagar"
                              >
                                <Wallet size={14} />
                                <span>Pagar</span>
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
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPayablesPages > 1 && (
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
                  Página <strong>{payablesPage}</strong> de <strong>{totalPayablesPages}</strong> ({totalPayables} registros)
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    disabled={payablesPage <= 1}
                    onClick={() => setPayablesPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    disabled={payablesPage >= totalPayablesPages}
                    onClick={() => setPayablesPage((p) => Math.min(totalPayablesPages, p + 1))}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "suppliers" && (
        <>
          {/* Directorio de Proveedores */}
          <div className="fin-filter-card" style={{ justifyContent: "space-between" }}>
            <div className="fin-filter-field" style={{ flex: 1, minWidth: 280 }}>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  value={searchSuppliers}
                  onChange={(e) => {
                    setSearchSuppliers(e.target.value);
                    setSuppliersPage(1);
                  }}
                  placeholder="Buscar proveedor por nombre, NIT, teléfono..."
                />
              </div>
            </div>

            <button
              type="button"
              className="fin-btn fin-btn--primary"
              onClick={() => setOpenCreateSupplier(true)}
            >
              <PlusCircle size={16} />
              <span>Crear Proveedor</span>
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "1.15rem",
            }}
          >
            {suppliers.map((s) => (
              <div
                key={s.id}
                className="fin-kpi-card"
                style={{ padding: "1.25rem", gap: "0.75rem" }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Building2 size={20} color="var(--accent)" />
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{s.name}</strong>
                    </div>
                    {s.creditBalance > 0 && (
                      <span className="fin-badge fin-badge--success">
                        💰 Saldo a favor
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.45rem" }}>
                    NIT: <strong style={{ color: "#334155" }}>{s.taxId || "—"}</strong> · Tel: <strong style={{ color: "#334155" }}>{s.phone || "—"}</strong>
                  </div>

                  {s.email && (
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.2rem" }}>
                      Email: {s.email}
                    </div>
                  )}

                  {s.bankName && (
                    <div style={{ marginTop: "0.6rem", padding: "0.5rem 0.75rem", background: "#f8fafc", borderRadius: 8, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.45rem", border: "1px solid var(--border-color)" }}>
                      <CreditCard size={14} color="var(--accent)" />
                      <span>
                        {s.bankName} ({s.bankAccountType || "Cta"}): <strong>{s.bankAccountNumber}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.88rem",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.74rem", color: "#64748b", display: "block" }}>Deuda Actual:</span>
                    <strong style={{ color: s.totalDebt > 0 ? "#d97706" : "#64748b", fontSize: "1rem" }}>
                      {formatMoney(s.totalDebt)}
                    </strong>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.74rem", color: "#64748b", display: "block" }}>Saldo a favor empresa:</span>
                    <strong style={{ color: s.creditBalance > 0 ? "#059669" : "#64748b", fontSize: "1rem" }}>
                      {formatMoney(s.creditBalance)}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Crear Proveedor */}
      <CreateSupplierModal
        open={openCreateSupplier}
        onClose={() => setOpenCreateSupplier(false)}
        onSuccess={() => {
          void loadSuppliers();
        }}
      />

      {/* Modal Crear Factura / Deuda */}
      <CreatePayableModal
        open={openCreatePayable}
        onClose={() => setOpenCreatePayable(false)}
        onSuccess={() => {
          void loadPayables();
          void loadSuppliers();
        }}
      />

      {/* Modal Pagar / Salida de Dinero */}
      {selectedForPayment && (
        <AddPayablePaymentModal
          open={Boolean(selectedForPayment)}
          payable={selectedForPayment}
          onClose={() => setSelectedForPayment(null)}
          onSuccess={() => {
            void loadPayables();
            void loadSuppliers();
          }}
        />
      )}

      {/* Modal Detalle */}
      {selectedDetailId && (
        <PayableDetailModal
          open={Boolean(selectedDetailId)}
          payableId={selectedDetailId}
          onClose={() => setSelectedDetailId(null)}
          onAbonar={(payable) => {
            setSelectedDetailId(null);
            setSelectedForPayment(payable);
          }}
        />
      )}
    </div>
  );
}
