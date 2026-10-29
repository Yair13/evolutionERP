import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchPayables,
  fetchSuppliers,
  deleteSupplier,
  type PayableSummaryItem,
  type SupplierItem,
  type PayableStatus,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { formatBogotaDate } from "../../lib/dateUtils.js";
import { CreateSupplierModal } from "../../components/finance/CreateSupplierModal.js";
import { EditSupplierModal } from "../../components/finance/EditSupplierModal.js";
import { SupplierDetailModal } from "../../components/finance/SupplierDetailModal.js";
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
  Edit2,
  Phone,
  Mail,
  MapPin,
  X,
  Users,
  Trash2,
} from "lucide-react";

function formatMoney(n: number | null | undefined): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
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
  const [supplierDebtFilter, setSupplierDebtFilter] = useState<"all" | "debt" | "favour">("all");
  const [suppliersPage, setSuppliersPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [openCreateSupplier, setOpenCreateSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [selectedDetailSupplierId, setSelectedDetailSupplierId] = useState<string | null>(null);
  const [preselectedSupplierId, setPreselectedSupplierId] = useState<string | null>(null);
  const [openCreatePayable, setOpenCreatePayable] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState<PayableSummaryItem | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

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
  }, [token, isAllWarehouses, warehouseId, selectedWarehouse, selectedStatus, dueDateFrom, dueDateTo, searchPayables, payablesPage, whLoading]);

  // Cargar Proveedores
    const handleDeleteSupplier = async (sup: { id: string; name: string }) => {
    if (!isAllWarehouses) {
      alert("Solo se pueden eliminar proveedores desde la Sede Administrativa.");
      return;
    }
    const ok = window.confirm(
      `¿Estás seguro de que deseas eliminar al proveedor "${sup.name}"?\n\n` +
      `Esta acción solo está permitida desde la Sede Administrativa.\n` +
      `• Si no tiene facturas ni comprobantes registrados, se eliminará definitivamente.\n` +
      `• Si tiene historial comercial cerrado, se archivará para proteger la contabilidad.\n` +
      `• No podrá eliminarse si tiene cuentas pendientes de pago o saldos a favor.`
    );
    if (!ok) return;

    try {
      const res = await deleteSupplier(token!, sup.id);
      alert(res.message || "Operación realizada con éxito.");
      if (selectedDetailSupplierId === sup.id) {
        setSelectedDetailSupplierId(null);
      }
      void loadSuppliers();
      void loadPayables();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar el proveedor.");
    }
  };

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSuppliers(token, {
        q: searchSuppliers.trim() || null,
        limit: 100,
        offset: (suppliersPage - 1) * 100,
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

  // Cálculos consolidados de proveedores
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (supplierDebtFilter === "debt") return s.totalDebt > 0;
      if (supplierDebtFilter === "favour") return s.creditBalance > 0;
      return true;
    });
  }, [suppliers, supplierDebtFilter]);

  const suppliersWithDebtCount = useMemo(() => {
    return suppliers.filter((s) => s.totalDebt > 0).length;
  }, [suppliers]);

  const suppliersWithFavourCount = useMemo(() => {
    return suppliers.filter((s) => s.creditBalance > 0).length;
  }, [suppliers]);

  const totalSuppliersDebt = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.totalDebt || 0), 0);
  }, [suppliers]);

  const totalCompanyCreditWithSuppliers = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.creditBalance || 0), 0);
  }, [suppliers]);

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
                Gestión integral de proveedores, deudas, programación de egresos, historial de abonos y saldos a favor.
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
            onClick={() => {
              setPreselectedSupplierId(null);
              setOpenCreatePayable(true);
            }}
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
            {payablesSummary.openCount > 0 && (
              <span className="fin-tab__badge" style={{ background: "#fef3c7", color: "#d97706" }}>
                {payablesSummary.openCount} pend.
              </span>
            )}
          </button>
          <button
            type="button"
            className={`fin-tab ${activeTab === "suppliers" ? "is-active" : ""}`}
            onClick={() => setActiveTab("suppliers")}
          >
            <Building2 size={16} />
            <span>Directorio de Proveedores y Deuda General</span>
            {totalSuppliers > 0 && <span className="fin-tab__badge">{totalSuppliers}</span>}
          </button>
        </div>
      </div>

      {/* TAB 1: Cuentas por Pagar */}
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
                            <strong
                              style={{ color: "#0f172a", cursor: "pointer", textDecoration: "underline" }}
                              onClick={() => setSelectedDetailSupplierId(item.supplierId)}
                              title="Ver ficha del proveedor"
                            >
                              {item.supplierName}
                            </strong>
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
                              title="Ver detalle de factura"
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

      {/* TAB 2: Directorio de Proveedores */}
      {activeTab === "suppliers" && (
        <>
          {/* KPI Summary Cards para Proveedores */}
          <div className="fin-kpi-grid fin-kpi-grid--4" style={{ marginBottom: "1.25rem" }}>
            <div className="fin-kpi-card fin-kpi-card--amber">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#d97706" }}>Deuda Total a Proveedores</span>
                <div className="fin-kpi-icon fin-kpi-icon--amber">
                  <Clock size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--amber">
                {formatMoney(totalSuppliersDebt)}
              </div>
              <div className="fin-kpi-sub">
                {suppliersWithDebtCount} proveedor(es) con saldo pendiente
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--indigo">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Proveedores Registrados</span>
                <div className="fin-kpi-icon fin-kpi-icon--indigo">
                  <Users size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--indigo">
                {totalSuppliers}
              </div>
              <div className="fin-kpi-sub">
                Terceros y aliados comerciales
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
                {suppliersWithFavourCount} proveedor(es) con saldo a nuestro favor
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--emerald">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#059669" }}>Proveedores al Día</span>
                <div className="fin-kpi-icon fin-kpi-icon--emerald">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--emerald">
                {Math.max(0, suppliers.length - suppliersWithDebtCount)}
              </div>
              <div className="fin-kpi-sub">
                Sin deudas activas pendientes
              </div>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="fin-filter-card" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 280 }}>
              <div className="fin-search-wrap" style={{ flex: 1 }}>
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  value={searchSuppliers}
                  onChange={(e) => {
                    setSearchSuppliers(e.target.value);
                    setSuppliersPage(1);
                  }}
                  placeholder="Buscar por razón social, NIT, teléfono o contacto..."
                />
              </div>

              {/* Filtro rápido por estado de deuda */}
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={`fin-btn fin-btn--sm ${supplierDebtFilter === "all" ? "fin-btn--primary" : "fin-btn--ghost"}`}
                  onClick={() => setSupplierDebtFilter("all")}
                >
                  Todos ({suppliers.length})
                </button>
                <button
                  type="button"
                  className={`fin-btn fin-btn--sm ${supplierDebtFilter === "debt" ? "fin-btn--primary" : "fin-btn--ghost"}`}
                  onClick={() => setSupplierDebtFilter("debt")}
                  style={supplierDebtFilter === "debt" ? { background: "#d97706", borderColor: "#d97706" } : {}}
                >
                  Con Deuda ({suppliersWithDebtCount})
                </button>
                <button
                  type="button"
                  className={`fin-btn fin-btn--sm ${supplierDebtFilter === "favour" ? "fin-btn--primary" : "fin-btn--ghost"}`}
                  onClick={() => setSupplierDebtFilter("favour")}
                  style={supplierDebtFilter === "favour" ? { background: "#059669", borderColor: "#059669" } : {}}
                >
                  Con Saldo a Favor ({suppliersWithFavourCount})
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="fin-btn fin-btn--ghost"
                onClick={() => void loadSuppliers()}
                disabled={loading}
                title="Refrescar listado"
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                <span>Refrescar</span>
              </button>
              <button
                type="button"
                className="fin-btn fin-btn--primary"
                onClick={() => setOpenCreateSupplier(true)}
              >
                <PlusCircle size={16} />
                <span>Nuevo Proveedor</span>
              </button>
            </div>
          </div>

          {/* Listado / Grid de Proveedores */}
          {loading ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b" }}>
              <RefreshCw size={28} className="spin" style={{ margin: "0 auto 0.5rem" }} />
              <div>Cargando directorio de proveedores…</div>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="fin-table-card" style={{ padding: "3rem 1rem", textAlign: "center" }}>
              <Building2 size={36} style={{ margin: "0 auto 0.75rem", opacity: 0.35, color: "#64748b" }} />
              <h3 style={{ margin: 0, fontWeight: 600, color: "#1e293b" }}>No se encontraron proveedores</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Ajusta los filtros de búsqueda o registra un nuevo proveedor comercial.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: "1.15rem",
              }}
            >
              {filteredSuppliers.map((s) => (
                <div
                  key={s.id}
                  className="fin-kpi-card"
                  style={{
                    padding: "1.25rem",
                    gap: "0.85rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    border: s.totalDebt > 0 ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color)",
                    background: s.totalDebt > 0 ? "#fffdfa" : "#ffffff",
                  }}
                >
                  <div>
                    {/* Top row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: "rgba(99, 102, 241, 0.1)",
                            color: "#4f46e5",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Building2 size={18} />
                        </div>
                        <div>
                          <strong
                            style={{
                              fontSize: "1.05rem",
                              color: "#0f172a",
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                            onClick={() => setSelectedDetailSupplierId(s.id)}
                            title="Ver estado de cuenta completo"
                          >
                            {s.name}
                          </strong>
                          <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                            NIT: <strong style={{ color: "#334155" }}>{s.taxId || "—"}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        {s.creditBalance > 0 && (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#059669",
                              border: "1px solid rgba(16, 185, 129, 0.35)",
                            }}
                          >
                            💰 {formatMoney(s.creditBalance)}
                          </span>
                        )}
                        {!s.isActive && (
                          <span className="fin-badge fin-badge--neutral" style={{ fontSize: "0.7rem" }}>
                            Inactivo
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contact details */}
                    <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {s.contactName && (
                        <div>Contacto: <strong style={{ color: "#334155" }}>{s.contactName}</strong></div>
                      )}
                      {s.phone && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Phone size={12} /> {s.phone}
                        </div>
                      )}
                      {s.email && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Mail size={12} /> {s.email}
                        </div>
                      )}
                      {s.address && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <MapPin size={12} /> {s.address} {s.city ? `(${s.city})` : ""}
                        </div>
                      )}
                    </div>

                    {/* Bank info box */}
                    {s.bankName && (
                      <div
                        style={{
                          marginTop: "0.65rem",
                          padding: "0.45rem 0.65rem",
                          background: "#f8fafc",
                          borderRadius: 8,
                          fontSize: "0.78rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          border: "1px solid var(--border-color)",
                          color: "#334155",
                        }}
                      >
                        <CreditCard size={14} color="var(--accent)" />
                        <span>
                          {s.bankName} ({s.bankAccountType || "Cta"}): <strong>{s.bankAccountNumber}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Financial status summary */}
                  <div
                    style={{
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--border-color)",
                      marginTop: "0.4rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "0.72rem", color: "#64748b", display: "block" }}>Deuda Actual:</span>
                        <strong
                          style={{
                            color: s.totalDebt > 0 ? "#d97706" : "#059669",
                            fontSize: s.totalDebt > 0 ? "1.08rem" : "0.95rem",
                          }}
                        >
                          {formatMoney(s.totalDebt)}
                        </strong>
                        {s.openPayablesCount > 0 && (
                          <span style={{ fontSize: "0.7rem", color: "#d97706", display: "block" }}>
                            {s.openPayablesCount} factura(s) pendiente(s)
                          </span>
                        )}
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "0.72rem", color: "#64748b", display: "block" }}>Saldo a favor:</span>
                        <strong
                          style={{
                            color: s.creditBalance > 0 ? "#059669" : "#64748b",
                            fontSize: s.creditBalance > 0 ? "1.05rem" : "0.95rem",
                          }}
                        >
                          {formatMoney(s.creditBalance)}
                        </strong>
                      </div>
                    </div>

                    {/* Action buttons on card */}
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="fin-btn fin-btn--primary fin-btn--sm"
                        style={{ flex: 1, justifyContent: "center" }}
                        onClick={() => setSelectedDetailSupplierId(s.id)}
                        title="Ver historial de facturas, abonos y estado de cuenta"
                      >
                        <Eye size={13} />
                        <span>Ver Ficha</span>
                      </button>

                      <button
                        type="button"
                        className="fin-btn fin-btn--ghost fin-btn--sm"
                        onClick={() => setEditingSupplier(s)}
                        title="Editar datos personales, contacto y bancarios"
                      >
                        <Edit2 size={13} />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        className="fin-btn fin-btn--ghost fin-btn--sm"
                        onClick={() => {
                          setPreselectedSupplierId(s.id);
                          setOpenCreatePayable(true);
                        }}
                        title="Registrar nueva factura con este proveedor"
                      >
                        <PlusCircle size={13} />
                        <span>Factura</span>
                      </button>

                      {isAllWarehouses && (
                        <button
                          type="button"
                          className="fin-btn fin-btn--ghost fin-btn--sm"
                          onClick={() => void handleDeleteSupplier(s)}
                          title="Eliminar proveedor (solo Sede Administrativa)"
                          style={{ color: "#dc2626" }}
                        >
                          <Trash2 size={13} />
                          <span>Eliminar</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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

      {/* Modal Editar Proveedor */}
      <EditSupplierModal
        open={Boolean(editingSupplier)}
        supplier={editingSupplier}
        onClose={() => setEditingSupplier(null)}
        onSuccess={() => {
          void loadSuppliers();
          void loadPayables();
        }}
      />

      {/* Modal Detalle / Estado de Cuenta del Proveedor */}
      <SupplierDetailModal
        open={Boolean(selectedDetailSupplierId)}
        supplierId={selectedDetailSupplierId}
        onClose={() => setSelectedDetailSupplierId(null)}
        onEditSupplier={(sup) => {
          setEditingSupplier(sup);
        }}
        onPagarFactura={(payable) => {
          setSelectedForPayment(payable);
        }}
        onNuevaFactura={(supId) => {
          setPreselectedSupplierId(supId);
          setOpenCreatePayable(true);
        }}
        onViewReceiptPhoto={(url) => setPreviewPhotoUrl(url)}
      />

      {/* Modal Crear Factura / Deuda */}
      <CreatePayableModal
        open={openCreatePayable}
        preselectedSupplierId={preselectedSupplierId}
        onClose={() => {
          setOpenCreatePayable(false);
          setPreselectedSupplierId(null);
        }}
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

      {/* Modal Detalle de Factura */}
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

      {/* Modal Previsualizar Foto de Recibo */}
      {previewPhotoUrl && (
        <div
          className="inv-modal-backdrop"
          role="presentation"
          onClick={() => setPreviewPhotoUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="inv-modal"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640, width: "100%", background: "#fff", borderRadius: 16, overflow: "hidden" }}
          >
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "1rem" }}>Comprobante de Pago</strong>
              <button
                type="button"
                className="inv-modal__close"
                onClick={() => setPreviewPhotoUrl(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: 16, textAlign: "center" }}>
              <img
                src={previewPhotoUrl}
                alt="Comprobante"
                style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
