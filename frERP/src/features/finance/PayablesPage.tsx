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

export function PayablesPage() {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, setWarehouseId } = useWarehouse();

  const [activeTab, setActiveTab] = useState<"payables" | "suppliers">("payables");

  // Filtros de Cuentas por Pagar
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(warehouseId || "");
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
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPayables(token, {
        warehouseId: selectedWarehouse || null,
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
  }, [token, selectedWarehouse, selectedStatus, dueDateFrom, dueDateTo, searchPayables, payablesPage]);

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
    <div className="inv-page">
      {/* Header */}
      <div className="inv-page__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Truck size={28} color="#f59e0b" />
            <h1 className="inv-page__title">Proveedores y Cuentas por Pagar</h1>
          </div>
          <p className="inv-page__subtitle">
            Gestión de proveedores, facturas de compra, comprobantes de egreso (salidas de caja) y saldo a favor.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            onClick={() => setOpenCreateSupplier(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <PlusCircle size={17} />
            Nuevo Proveedor
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={() => setOpenCreatePayable(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <PlusCircle size={17} />
            Registrar Factura / Deuda
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--inv-border)", margin: "1rem 0" }}>
        <button
          type="button"
          onClick={() => setActiveTab("payables")}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "payables" ? "2px solid #f59e0b" : "2px solid transparent",
            color: activeTab === "payables" ? "#f59e0b" : "var(--inv-text-muted)",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          Cuentas por Pagar (Facturas y Deudas)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("suppliers")}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "suppliers" ? "2px solid #f59e0b" : "2px solid transparent",
            color: activeTab === "suppliers" ? "#f59e0b" : "var(--inv-text-muted)",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          Directorio de Proveedores {totalSuppliers > 0 ? `(${totalSuppliers})` : ""}
        </button>
      </div>

      {activeTab === "payables" && (
        <>
          {/* KPI Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
                <span>Deuda Total Pendiente</span>
                <Clock size={18} color="#f59e0b" />
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f59e0b", marginTop: "0.5rem" }}>
                {formatMoney(payablesSummary.totalBalance)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                {payablesSummary.openCount} factura(s) por pagar
              </div>
            </div>

            <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
                <span>Total Facturado a la Fecha</span>
                <Truck size={18} color="#818cf8" />
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}>
                {formatMoney(payablesSummary.totalBilled)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                Valor acumulado de compras
              </div>
            </div>

            <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
                <span>Total Pagado / Egresos</span>
                <CheckCircle2 size={18} color="#10b981" />
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#10b981", marginTop: "0.5rem" }}>
                {formatMoney(payablesSummary.totalPaid)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                Salidas de dinero registradas
              </div>
            </div>

            <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
                <span>Saldo a Favor en Proveedores</span>
                <Wallet size={18} color="#10b981" />
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#10b981", marginTop: "0.5rem" }}>
                {formatMoney(totalCompanyCreditWithSuppliers)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                Excedentes listos para usar
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
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>SEDE / BODEGA</span>
              <select
                value={selectedWarehouse}
                onChange={(e) => {
                  setSelectedWarehouse(e.target.value);
                  setWarehouseId(e.target.value);
                  setPayablesPage(1);
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
                  setPayablesPage(1);
                }}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
              >
                <option value="open">Pendientes / Con Saldo</option>
                <option value="paid">Pagadas al 100%</option>
                <option value="all">Todas las Facturas</option>
              </select>
            </label>

            {/* Búsqueda */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, minWidth: 200 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>BUSCAR FACTURA O PROVEEDOR</span>
              <div style={{ position: "relative" }}>
                <input
                  value={searchPayables}
                  onChange={(e) => {
                    setSearchPayables(e.target.value);
                    setPayablesPage(1);
                  }}
                  placeholder="N° factura, proveedor, concepto..."
                  style={{ width: "100%", padding: "6px 10px 6px 30px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
                />
                <Search size={15} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--inv-text-muted)" }} />
              </div>
            </label>

            {/* Vencimiento Desde */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>VENCE DESDE</span>
              <input
                type="date"
                value={dueDateFrom}
                onChange={(e) => {
                  setDueDateFrom(e.target.value);
                  setPayablesPage(1);
                }}
                style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
              />
            </label>

            {/* Vencimiento Hasta */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>VENCE HASTA</span>
              <input
                type="date"
                value={dueDateTo}
                onChange={(e) => {
                  setDueDateTo(e.target.value);
                  setPayablesPage(1);
                }}
                style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
              />
            </label>
          </div>

          {error && <div className="inv-form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

          {/* Tabla Cuentas por Pagar */}
          <div style={{ background: "var(--inv-bg-elevated)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--inv-border)" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="inv-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Factura / N°</th>
                    <th>Proveedor</th>
                    <th>Sede</th>
                    <th>Concepto</th>
                    <th>Total</th>
                    <th>Pagado</th>
                    <th>Saldo Pendiente</th>
                    <th>Estado</th>
                    <th>Vencimiento</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "2rem", color: "var(--inv-text-muted)" }}>
                        Cargando cuentas por pagar...
                      </td>
                    </tr>
                  ) : payables.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--inv-text-muted)" }}>
                        <Filter size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
                        <div>No se encontraron cuentas por pagar con los filtros seleccionados.</div>
                      </td>
                    </tr>
                  ) : (
                    payables.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.billNumber || "S/N"}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)" }}>
                            {formatDate(item.issueDate || item.createdAt)}
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{item.supplierName}</strong>
                            <div style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>
                              NIT: {item.supplierTaxId || "—"}
                            </div>
                          </div>
                        </td>
                        <td>{item.warehouseName}</td>
                        <td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.description || ""}>
                          {item.description || "—"}
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatMoney(item.totalAmount)}</td>
                        <td style={{ fontWeight: 600, color: "#10b981" }}>{formatMoney(item.paidAmount)}</td>
                        <td style={{ fontWeight: 700, color: item.balanceAmount === 0 ? "#10b981" : "#f59e0b" }}>
                          {formatMoney(item.balanceAmount)}
                        </td>
                        <td>
                          {item.status === "open" && (
                            <span className="badge badge--warning" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                              Pendiente
                            </span>
                          )}
                          {item.status === "partial" && (
                            <span className="badge badge--primary" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}>
                              Abonado
                            </span>
                          )}
                          {item.status === "paid" && (
                            <span className="badge badge--success" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                              Pagada
                            </span>
                          )}
                        </td>
                        <td>
                          {item.dueDate ? (
                            <div style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <Calendar size={13} color="var(--inv-text-muted)" />
                              {item.dueDate}
                            </div>
                          ) : (
                            <span style={{ color: "var(--inv-text-muted)", fontSize: "0.82rem" }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                            {item.status !== "paid" && item.status !== "cancelled" && (
                              <button
                                type="button"
                                className="inv-btn inv-btn--primary"
                                style={{ padding: "4px 8px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 3 }}
                                onClick={() => setSelectedForPayment(item)}
                                title="Registrar egreso / pagar"
                              >
                                <Wallet size={14} />
                                Pagar
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

            {totalPayablesPages > 1 && (
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
                  Página <strong>{payablesPage}</strong> de <strong>{totalPayablesPages}</strong> ({totalPayables} registros)
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    disabled={payablesPage <= 1}
                    onClick={() => setPayablesPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
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
          <div
            style={{
              background: "var(--inv-bg-elevated)",
              padding: "1rem",
              borderRadius: 8,
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ position: "relative", minWidth: 280, flex: 1 }}>
              <input
                value={searchSuppliers}
                onChange={(e) => {
                  setSearchSuppliers(e.target.value);
                  setSuppliersPage(1);
                }}
                placeholder="Buscar proveedor por nombre, NIT, teléfono..."
                style={{ width: "100%", padding: "8px 10px 8px 32px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
              />
              <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--inv-text-muted)" }} />
            </div>

            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={() => setOpenCreateSupplier(true)}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <PlusCircle size={16} />
              Crear Proveedor
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "1rem",
            }}
          >
            {suppliers.map((s) => (
              <div
                key={s.id}
                style={{
                  background: "var(--inv-bg-elevated)",
                  borderRadius: 10,
                  padding: "1.2rem",
                  border: "1px solid var(--inv-border)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Building2 size={20} color="#6366f1" />
                      <strong style={{ fontSize: "1.05rem" }}>{s.name}</strong>
                    </div>
                    {s.creditBalance > 0 && (
                      <span className="badge badge--success" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontSize: "0.75rem" }}>
                        💰 Saldo a favor
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)", marginTop: "0.4rem" }}>
                    NIT: <strong>{s.taxId || "—"}</strong> · Tel: <strong>{s.phone || "—"}</strong>
                  </div>

                  {s.email && (
                    <div style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)", marginTop: "0.2rem" }}>
                      Email: {s.email}
                    </div>
                  )}

                  {s.bankName && (
                    <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", background: "var(--inv-bg-field)", borderRadius: 6, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <CreditCard size={14} color="#818cf8" />
                      <span>
                        {s.bankName} ({s.bankAccountType || "Cta"}): <strong>{s.bankAccountNumber}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--inv-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.88rem",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", display: "block" }}>Deuda Actual:</span>
                    <strong style={{ color: s.totalDebt > 0 ? "#f59e0b" : "var(--inv-text-muted)" }}>
                      {formatMoney(s.totalDebt)}
                    </strong>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", display: "block" }}>Saldo a favor empresa:</span>
                    <strong style={{ color: s.creditBalance > 0 ? "#10b981" : "var(--inv-text-muted)" }}>
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
