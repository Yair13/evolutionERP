import { useCallback, useEffect, useState } from "react";
import {
  Users,
  DollarSign,
  Plus,
  Search,
  Printer,
  FileText,
  CreditCard,
  CheckCircle2,
  RefreshCw,
  Edit2,
  Wallet,
} from "lucide-react";
import {
  fetchEmployees,
  fetchPayrollPayments,
  fetchPayrollSummary,
  type EmployeeItem,
  type PayrollPaymentItem,
  type PayrollSummary,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { CreateEmployeeModal } from "../../components/finance/CreateEmployeeModal.js";
import { CreatePayrollPaymentModal } from "../../components/finance/CreatePayrollPaymentModal.js";
import { PrintPayrollVoucherModal } from "../../components/finance/PrintPayrollVoucherModal.js";
import { ViewReceiptModal } from "../../components/finance/ViewReceiptModal.js";
import {
  getTodayBogotaYmd,
} from "../../lib/dateUtils.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localMonthRange(): { from: string; to: string } {
  const todayYmd = getTodayBogotaYmd();
  const [y, m] = todayYmd.split("-");
  const from = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function PayrollPage() {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();
  const canSeeAll =
    isAllWarehouses || user?.roles.includes("super_admin") || user?.roles.includes("secretaria");

  const [activeTab, setActiveTab] = useState<"payments" | "employees">("payments");

  // Filtros
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? "" : warehouseId || ""
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [dateFrom, setDateFrom] = useState(() => localMonthRange().from);
  const [dateTo, setDateTo] = useState(() => localMonthRange().to);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  // Datos
  const [payments, setPayments] = useState<PayrollPaymentItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<EmployeeItem | null>(null);
  const [showCreatePayment, setShowCreatePayment] = useState(false);
  const [preselectedEmployeeId, setPreselectedEmployeeId] = useState<string | undefined>(undefined);
  const [viewingVoucher, setViewingVoucher] = useState<PayrollPaymentItem | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<PayrollPaymentItem | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [empRes, payRes, sumRes] = await Promise.all([
        fetchEmployees(token, {
          warehouseId: selectedWarehouseId || undefined,
          search: employeeSearch || undefined,
        }),
        fetchPayrollPayments(token, {
          warehouseId: selectedWarehouseId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          paymentMethod: paymentMethodFilter || undefined,
          search: search || undefined,
        }),
        fetchPayrollSummary(token, {
          warehouseId: selectedWarehouseId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      ]);

      setEmployees(empRes.items);
      setPayments(payRes.items);
      setSummary(sumRes);
    } catch (err: any) {
      setError(err?.message || "Error al cargar nómina");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId, dateFrom, dateTo, paymentMethodFilter, search, employeeSearch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Atajos de fecha
  function setPeriodPreset(type: "month" | "today" | "all") {
    if (type === "today") {
      const t = getTodayBogotaYmd();
      setDateFrom(t);
      setDateTo(t);
    } else if (type === "month") {
      const r = localMonthRange();
      setDateFrom(r.from);
      setDateTo(r.to);
    } else if (type === "all") {
      setDateFrom("");
      setDateTo("");
    }
  }

  return (
    <div className="fin-page">
      {/* Encabezado */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--emerald">
              <Users size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Nómina y Colaboradores</h1>
              <p className="fin-header__subtitle">
                Liquidación de nómina con vouchers impresos, descuento automático de cierres en efectivo y control de transferencias.
              </p>
            </div>
          </div>
        </div>

        <div className="fin-header__actions">
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => {
              setEmployeeToEdit(null);
              setShowCreateEmployee(true);
            }}
          >
            <Plus size={16} />
            <span>Nuevo Colaborador</span>
          </button>
          <button
            type="button"
            className="fin-btn fin-btn--primary"
            onClick={() => {
              setPreselectedEmployeeId(undefined);
              setShowCreatePayment(true);
            }}
          >
            <DollarSign size={16} />
            <span>Registrar Pago de Nómina</span>
          </button>
        </div>
      </div>

      {/* Tarjetas Métricas de Resumen */}
      {summary && (
        <div className="fin-kpi-grid fin-kpi-grid--4">
          {/* Total Pagado */}
          <div className="fin-kpi-card fin-kpi-card--indigo">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Total Nómina Liquidada</span>
              <div className="fin-kpi-icon fin-kpi-icon--indigo">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--indigo">
              {formatMoney(summary.totalPaid)}
            </div>
            <div className="fin-kpi-sub">
              {summary.paymentCount} comprobantes emitidos en el período
            </div>
          </div>

          {/* Pagado en Efectivo */}
          <div className="fin-kpi-card fin-kpi-card--amber">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label" style={{ color: "#d97706" }}>💵 Efectivo (Caja de Sede)</span>
              <div className="fin-kpi-icon fin-kpi-icon--amber">
                <Wallet size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--amber">
              {formatMoney(summary.cashTotal)}
            </div>
            <div className="fin-kpi-sub" style={{ color: "#d97706", fontWeight: 600 }}>
              ✓ Descontado del valor del cierre
            </div>
          </div>

          {/* Pagado por Transferencias */}
          <div className="fin-kpi-card fin-kpi-card--teal">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label" style={{ color: "var(--accent)" }}>🏦 Bancos / Digitales</span>
              <div className="fin-kpi-icon fin-kpi-icon--teal">
                <CreditCard size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--teal">
              {formatMoney(summary.transferTotal)}
            </div>
            <div className="fin-kpi-sub">
              Bancolombia, Nequi, Davivienda...
            </div>
          </div>

          {/* Colaboradores */}
          <div className="fin-kpi-card fin-kpi-card--emerald">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label" style={{ color: "#059669" }}>Colaboradores Pagados</span>
              <div className="fin-kpi-icon fin-kpi-icon--emerald">
                <Users size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--emerald">
              {summary.employeesCount} de {employees.length}
            </div>
            <div className="fin-kpi-sub">
              {employees.filter((e) => e.isActive).length} activos registrados
            </div>
          </div>
        </div>
      )}

      {/* Pestañas de Navegación */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="fin-tabs">
          <button
            type="button"
            className={`fin-tab ${activeTab === "payments" ? "is-active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            <FileText size={16} />
            <span>Comprobantes de Pago y Vouchers</span>
            {payments.length > 0 && <span className="fin-tab__badge">{payments.length}</span>}
          </button>
          <button
            type="button"
            className={`fin-tab ${activeTab === "employees" ? "is-active" : ""}`}
            onClick={() => setActiveTab("employees")}
          >
            <Users size={16} />
            <span>Directorio de Colaboradores</span>
            {employees.length > 0 && <span className="fin-tab__badge">{employees.length}</span>}
          </button>
        </div>
      </div>

      {error && <div className="fin-alert fin-alert--danger">{error}</div>}

      {/* ─── PESTAÑA 1: PAGOS DE NÓMINA ─────────────────────────────────────────── */}
      {activeTab === "payments" && (
        <>
          {/* Barra de Filtros */}
          <div className="fin-filter-card">
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

            <div className="fin-filter-field" style={{ minWidth: 150 }}>
              <span>MEDIO DE PAGO</span>
              <select
                className="fin-select"
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
              >
                <option value="">Todos los Medios</option>
                <option value="efectivo">💵 Efectivo (Caja)</option>
                <option value="bancolombia">🟡 Bancolombia</option>
                <option value="davivienda">🔴 Davivienda</option>
                <option value="nequi">🟣 Nequi</option>
                <option value="daviplata">📱 Daviplata</option>
              </select>
            </div>

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
              <div className="fin-period-group">
                <button
                  type="button"
                  className="fin-period-btn"
                  onClick={() => setPeriodPreset("today")}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className="fin-period-btn"
                  onClick={() => setPeriodPreset("month")}
                >
                  Mes
                </button>
                <button
                  type="button"
                  className="fin-period-btn"
                  onClick={() => setPeriodPreset("all")}
                >
                  Todo
                </button>
              </div>
            </div>

            <div className="fin-filter-field" style={{ flex: 2, minWidth: 200 }}>
              <span>BUSCAR COMPROBANTE</span>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Voucher, colaborador, cédula o ref..."
                />
              </div>
            </div>

            <div className="fin-filter-field fin-filter-field--fixed">
              <button
                type="button"
                className="fin-btn fin-btn--ghost"
                onClick={() => void loadData()}
                title="Refrescar nómina"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                <span>Refrescar</span>
              </button>
            </div>
          </div>

          {/* Tabla de Pagos de Nómina */}
          {loading ? (
            <div className="fin-empty">
              <RefreshCw size={24} className="spin" />
              <h3 className="fin-empty__title">Cargando historial de nómina</h3>
            </div>
          ) : payments.length === 0 ? (
            <div className="fin-empty">
              <DollarSign size={32} />
              <h3 className="fin-empty__title">No se encontraron pagos de nómina</h3>
              <p className="fin-empty__desc">Ajusta los filtros o registra el primer pago a un colaborador.</p>
              <button
                type="button"
                className="fin-btn fin-btn--primary"
                onClick={() => setShowCreatePayment(true)}
                style={{ marginTop: "0.5rem" }}
              >
                <DollarSign size={16} />
                <span>Registrar Pago de Nómina</span>
              </button>
            </div>
          ) : (
            <div className="fin-table-card">
              <div className="fin-table-header">
                <h3 className="fin-table-title">
                  <FileText size={18} color="var(--accent)" />
                  <span>Comprobantes de Nómina Emitidos</span>
                </h3>
                <span className="fin-badge fin-badge--neutral">
                  {payments.length} comprobantes
                </span>
              </div>

              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Voucher #</th>
                      <th>Fecha</th>
                      <th>Colaborador</th>
                      <th>Sede</th>
                      <th>Período</th>
                      <th style={{ textAlign: "right" }}>Neto Pagado</th>
                      <th>Forma de Pago</th>
                      <th style={{ textAlign: "center" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const isCash = p.paymentMethod.toLowerCase() === "efectivo";
                      const hasReceipt = Boolean(p.transferReceiptUrl);

                      return (
                        <tr key={p.id}>
                          <td>
                            <button
                              type="button"
                              onClick={() => setViewingVoucher(p)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--accent)",
                                fontWeight: 800,
                                cursor: "pointer",
                                padding: 0,
                                textAlign: "left",
                              }}
                            >
                              {p.voucherNumber}
                            </button>
                          </td>
                          <td style={{ whiteSpace: "nowrap", color: "#64748b" }}>
                            {p.paymentDate}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{p.employeeName}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              {p.employeeDocType ?? "CC"} {p.employeeDocNumber} · {p.employeePosition}
                            </div>
                          </td>
                          <td>
                            <span className="fin-badge fin-badge--neutral">
                              {p.warehouseCode ?? "MAIN"}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.periodConcept}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              {p.periodStart} al {p.periodEnd}
                            </div>
                          </td>
                          <td className="fin-table-num" style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>
                            {formatMoney(p.netAmount)}
                          </td>
                          <td>
                            {isCash ? (
                              <span
                                className="fin-badge fin-badge--warning"
                                title="Descontado del cierre de caja"
                              >
                                💵 Efectivo (Caja)
                              </span>
                            ) : (
                              <span className="fin-badge fin-badge--info">
                                🏦 {p.paymentMethod.toUpperCase()}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                              {/* Botón Imprimir Voucher */}
                              <button
                                type="button"
                                className="fin-btn fin-btn--ghost fin-btn--sm"
                                onClick={() => setViewingVoucher(p)}
                                title="Ver e imprimir voucher de nómina"
                              >
                                <Printer size={14} />
                                <span>Voucher</span>
                              </button>

                              {/* Botón Soporte Bancario */}
                              {!isCash && (
                                <button
                                  type="button"
                                  className={`fin-btn fin-btn--sm ${hasReceipt ? "fin-btn--ghost" : "fin-btn--primary"}`}
                                  onClick={() => setViewingReceipt(p)}
                                  title={hasReceipt ? "Ver soporte de transferencia" : "Subir soporte bancario"}
                                >
                                  {hasReceipt ? <CheckCircle2 size={14} /> : <CreditCard size={14} />}
                                  <span>{hasReceipt ? "Soporte" : "Adjuntar"}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── PESTAÑA 2: EMPLEADOS / COLABORADORES ───────────────────────────────── */}
      {activeTab === "employees" && (
        <>
          {/* Barra de Filtros de Colaboradores */}
          <div className="fin-filter-card" style={{ justifyContent: "space-between" }}>
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

            <div className="fin-filter-field" style={{ flex: 2, minWidth: 220 }}>
              <span>BUSCAR COLABORADOR</span>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Nombre, cédula, cargo o código..."
                />
              </div>
            </div>

            <button
              type="button"
              className="fin-btn fin-btn--primary"
              onClick={() => {
                setEmployeeToEdit(null);
                setShowCreateEmployee(true);
              }}
            >
              <Plus size={16} />
              <span>Crear Colaborador</span>
            </button>
          </div>

          {/* Tabla de Colaboradores */}
          {employees.length === 0 ? (
            <div className="fin-empty">
              <Users size={32} />
              <h3 className="fin-empty__title">No hay colaboradores registrados</h3>
              <p className="fin-empty__desc">Registra los colaboradores de la empresa para liquidar sus nóminas.</p>
              <button
                type="button"
                className="fin-btn fin-btn--primary"
                onClick={() => {
                  setEmployeeToEdit(null);
                  setShowCreateEmployee(true);
                }}
                style={{ marginTop: "0.5rem" }}
              >
                <Plus size={16} />
                <span>Registrar Colaborador</span>
              </button>
            </div>
          ) : (
            <div className="fin-table-card">
              <div className="fin-table-header">
                <h3 className="fin-table-title">
                  <Users size={18} color="var(--accent)" />
                  <span>Equipo y Colaboradores</span>
                </h3>
                <span className="fin-badge fin-badge--neutral">
                  {employees.length} registros
                </span>
              </div>

              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Colaborador</th>
                      <th>Cargo</th>
                      <th>Sede Asignada</th>
                      <th style={{ textAlign: "right" }}>Sueldo Base</th>
                      <th>Periodicidad</th>
                      <th>Cuenta Bancaria</th>
                      <th>Estado</th>
                      <th style={{ textAlign: "center" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr
                        key={emp.id}
                        style={{ opacity: emp.isActive ? 1 : 0.6 }}
                      >
                        <td>
                          <span className="fin-badge fin-badge--teal" style={{ fontWeight: 800 }}>
                            {emp.code}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{emp.fullName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {emp.documentType} {emp.documentNumber} {emp.phone && `· ${emp.phone}`}
                          </div>
                        </td>
                        <td>{emp.position}</td>
                        <td>
                          {emp.warehouseName ? (
                            <span className="fin-badge fin-badge--neutral">
                              {emp.warehouseName} ({emp.warehouseCode})
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Sin sede fija</span>
                          )}
                        </td>
                        <td className="fin-table-num" style={{ fontWeight: 700 }}>
                          {formatMoney(emp.baseSalary)}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>
                          {emp.paymentFrequency}
                        </td>
                        <td>
                          {emp.bankName ? (
                            <div style={{ fontSize: "0.8rem" }}>
                              <strong style={{ color: "#0f172a" }}>{emp.bankName}</strong> ({emp.bankAccountType ?? "Cta"})
                              <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{emp.bankAccountNumber ?? "—"}</div>
                            </div>
                          ) : (
                            <span style={{ color: "#64748b", fontSize: "0.8rem" }}>Efectivo</span>
                          )}
                        </td>
                        <td>
                          {emp.isActive ? (
                            <span className="fin-badge fin-badge--success">
                              Activo
                            </span>
                          ) : (
                            <span className="fin-badge fin-badge--neutral">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="fin-btn fin-btn--ghost fin-btn--sm"
                              onClick={() => {
                                setEmployeeToEdit(emp);
                                setShowCreateEmployee(true);
                              }}
                              title="Editar Colaborador"
                            >
                              <Edit2 size={13} />
                              <span>Editar</span>
                            </button>
                            {emp.isActive && (
                              <button
                                type="button"
                                className="fin-btn fin-btn--primary fin-btn--sm"
                                onClick={() => {
                                  setPreselectedEmployeeId(emp.id);
                                  setShowCreatePayment(true);
                                }}
                                title="Pagar nómina a este colaborador"
                              >
                                <DollarSign size={13} />
                                <span>Pagar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modales */}
      {showCreateEmployee && (
        <CreateEmployeeModal
          token={token!}
          employeeToEdit={employeeToEdit}
          onClose={() => {
            setShowCreateEmployee(false);
            setEmployeeToEdit(null);
          }}
          onSuccess={() => {
            setShowCreateEmployee(false);
            setEmployeeToEdit(null);
            void loadData();
          }}
        />
      )}

      {showCreatePayment && (
        <CreatePayrollPaymentModal
          token={token!}
          employees={employees.filter((e) => e.isActive)}
          preselectedEmployeeId={preselectedEmployeeId}
          onClose={() => {
            setShowCreatePayment(false);
            setPreselectedEmployeeId(undefined);
          }}
          onSuccess={(newPayment) => {
            setShowCreatePayment(false);
            setPreselectedEmployeeId(undefined);
            void loadData();
            setViewingVoucher(newPayment);
          }}
        />
      )}

      {viewingVoucher && (
        <PrintPayrollVoucherModal
          payment={viewingVoucher}
          onClose={() => setViewingVoucher(null)}
        />
      )}

      {viewingReceipt && (
        <ViewReceiptModal
          token={token!}
          payment={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          onUpdated={(updated) => {
            setViewingReceipt(updated);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
