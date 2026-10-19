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

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localMonthRange(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
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
    const today = new Date();
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (type === "today") {
      const t = ymd(today);
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
    <div className="container" style={{ paddingBottom: "3rem" }}>
      {/* Encabezado */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              margin: "0 0 0.25rem 0",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <Users size={28} className="text-primary" />
            Nómina y Colaboradores
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Liquidación de nómina con vouchers impresos, descuento de cierres en efectivo y control de transferencias
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            onClick={() => {
              setEmployeeToEdit(null);
              setShowCreateEmployee(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus size={16} /> Nuevo Colaborador
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={() => {
              setPreselectedEmployeeId(undefined);
              setShowCreatePayment(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <DollarSign size={16} /> Registrar Pago de Nómina
          </button>
        </div>
      </div>

      {/* Tarjetas Métricas de Resumen */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Total Pagado */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: 10,
              padding: "1rem 1.25rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
              Total Nómina Liquidada
            </span>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--text-primary)", margin: "4px 0" }}>
              {formatMoney(summary.totalPaid)}
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {summary.paymentCount} comprobantes emitidos
            </span>
          </div>

          {/* Pagado en Efectivo */}
          <div
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: 10,
              padding: "1rem 1.25rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#f59e0b" }}>
              💵 Efectivo (Caja de Sede)
            </span>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#f59e0b", margin: "4px 0" }}>
              {formatMoney(summary.cashTotal)}
            </div>
            <span style={{ fontSize: "0.75rem", color: "#fde68a" }}>
              ✓ Descontado del valor del cierre
            </span>
          </div>

          {/* Pagado por Transferencias */}
          <div
            style={{
              background: "rgba(14, 165, 233, 0.08)",
              border: "1px solid rgba(14, 165, 233, 0.25)",
              borderRadius: 10,
              padding: "1rem 1.25rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#38bdf8" }}>
              🏦 Bancos / Transferencias
            </span>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#38bdf8", margin: "4px 0" }}>
              {formatMoney(summary.transferTotal)}
            </div>
            <span style={{ fontSize: "0.75rem", color: "#bae6fd" }}>
              Bancolombia, Nequi, Davivienda...
            </span>
          </div>

          {/* Colaboradores */}
          <div
            style={{
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: 10,
              padding: "1rem 1.25rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#10b981" }}>
              Colaboradores Pagados
            </span>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#10b981", margin: "4px 0" }}>
              {summary.employeesCount} de {employees.length}
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {employees.filter((e) => e.isActive).length} activos registrados
            </span>
          </div>
        </div>
      )}

      {/* Pestañas de Navegación */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          marginBottom: "1.25rem",
          gap: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          style={{
            padding: "0.6rem 1rem",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "payments" ? "3px solid #0284c7" : "3px solid transparent",
            color: activeTab === "payments" ? "#0284c7" : "var(--text-muted)",
            fontWeight: activeTab === "payments" ? 700 : 500,
            cursor: "pointer",
            fontSize: "0.95rem",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FileText size={18} /> Comprobantes de Pago y Vouchers ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("employees")}
          style={{
            padding: "0.6rem 1rem",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "employees" ? "3px solid #0284c7" : "3px solid transparent",
            color: activeTab === "employees" ? "#0284c7" : "var(--text-muted)",
            fontWeight: activeTab === "employees" ? 700 : 500,
            cursor: "pointer",
            fontSize: "0.95rem",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <Users size={18} /> Colaboradores ({employees.length})
        </button>
      </div>

      {error && (
        <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", borderRadius: 8, marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* ─── PESTAÑA 1: PAGOS DE NÓMINA ─────────────────────────────────────────── */}
      {activeTab === "payments" && (
        <>
          {/* Barra de Filtros */}
          <div
            style={{
              background: "var(--bg-card-subtle, rgba(255,255,255,0.03))",
              border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
              borderRadius: 10,
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            {canSeeAll && (
              <label className="field" style={{ margin: 0, minWidth: 160 }}>
                <span>Sede</span>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  style={{ height: 38 }}
                >
                  <option value="">Todas las Sedes</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field" style={{ margin: 0 }}>
              <span>Medio Pago</span>
              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                style={{ height: 38 }}
              >
                <option value="">Todos los Medios</option>
                <option value="efectivo">💵 Efectivo (Caja)</option>
                <option value="bancolombia">🟡 Bancolombia</option>
                <option value="davivienda">🔴 Davivienda</option>
                <option value="nequi">🟣 Nequi</option>
                <option value="daviplata">📱 Daviplata</option>
              </select>
            </label>

            <label className="field" style={{ margin: 0 }}>
              <span>Desde</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ height: 38 }}
              />
            </label>

            <label className="field" style={{ margin: 0 }}>
              <span>Hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ height: 38 }}
              />
            </label>

            <div style={{ display: "flex", gap: "0.3rem", alignSelf: "flex-end" }}>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                style={{ height: 38, fontSize: "0.8rem", padding: "0 8px" }}
                onClick={() => setPeriodPreset("today")}
              >
                Hoy
              </button>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                style={{ height: 38, fontSize: "0.8rem", padding: "0 8px" }}
                onClick={() => setPeriodPreset("month")}
              >
                Mes
              </button>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                style={{ height: 38, fontSize: "0.8rem", padding: "0 8px" }}
                onClick={() => setPeriodPreset("all")}
              >
                Todo
              </button>
            </div>

            <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <span>Buscar</span>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Voucher, colaborador, cédula o ref..."
                  style={{ height: 38, paddingLeft: 30 }}
                />
                <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "var(--text-muted)" }} />
              </div>
            </label>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                style={{ height: 38, padding: "0 12px" }}
                onClick={() => void loadData()}
                title="Refrescar"
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>

          {/* Tabla de Pagos de Nómina */}
          {loading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Cargando historial de nómina…
            </div>
          ) : payments.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                background: "var(--bg-card, #1e293b)",
                borderRadius: 10,
                border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.1))",
              }}
            >
              <DollarSign size={40} className="text-muted" style={{ margin: "0 auto 0.75rem auto", opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No se encontraron comprobantes de pago de nómina</p>
              <p style={{ margin: "4px 0 1rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Ajusta los filtros o registra el primer pago a un colaborador.
              </p>
              <button
                type="button"
                className="inv-btn inv-btn--primary"
                onClick={() => setShowCreatePayment(true)}
              >
                <DollarSign size={16} /> Registrar Pago de Nómina
              </button>
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-card, #1e293b)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                borderRadius: 10,
                overflowX: "auto",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", textAlign: "left", background: "rgba(255, 255, 255, 0.02)" }}>
                    <th style={{ padding: "10px 14px" }}>Voucher #</th>
                    <th style={{ padding: "10px 14px" }}>Fecha</th>
                    <th style={{ padding: "10px 14px" }}>Colaborador</th>
                    <th style={{ padding: "10px 14px" }}>Sede</th>
                    <th style={{ padding: "10px 14px" }}>Período</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Neto Pagado</th>
                    <th style={{ padding: "10px 14px" }}>Forma de Pago</th>
                    <th style={{ padding: "10px 14px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const isCash = p.paymentMethod.toLowerCase() === "efectivo";
                    const hasReceipt = Boolean(p.transferReceiptUrl);

                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                        }}
                      >
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            type="button"
                            onClick={() => setViewingVoucher(p)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#38bdf8",
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: 0,
                              textAlign: "left",
                            }}
                          >
                            {p.voucherNumber}
                          </button>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {p.paymentDate}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600 }}>{p.employeeName}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {p.employeeDocType ?? "CC"} {p.employeeDocNumber} · {p.employeePosition}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: "0.8rem", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                            {p.warehouseCode ?? "MAIN"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600 }}>{p.periodConcept}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {p.periodStart} al {p.periodEnd}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, fontSize: "0.95rem" }}>
                          {formatMoney(p.netAmount)}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {isCash ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                background: "rgba(245, 158, 11, 0.12)",
                                color: "#f59e0b",
                                border: "1px solid rgba(245, 158, 11, 0.25)",
                              }}
                              title="Descontado del cierre de caja"
                            >
                              💵 Efectivo (Caja)
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                background: "rgba(14, 165, 233, 0.12)",
                                color: "#38bdf8",
                                border: "1px solid rgba(14, 165, 233, 0.25)",
                              }}
                            >
                              🏦 {p.paymentMethod.toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                            {/* Botón Imprimir Voucher */}
                            <button
                              type="button"
                              className="inv-btn inv-btn--ghost"
                              style={{ padding: "4px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                              onClick={() => setViewingVoucher(p)}
                              title="Ver e imprimir voucher de nómina"
                            >
                              <Printer size={14} /> Voucher
                            </button>

                            {/* Botón Soporte Bancario */}
                            {!isCash && (
                              <button
                                type="button"
                                className="inv-btn inv-btn--ghost"
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.75rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.3rem",
                                  color: hasReceipt ? "#10b981" : "#f59e0b",
                                  borderColor: hasReceipt ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)",
                                }}
                                onClick={() => setViewingReceipt(p)}
                                title={hasReceipt ? "Ver soporte de transferencia de Maicol" : "Subir soporte bancario de Maicol"}
                              >
                                {hasReceipt ? <CheckCircle2 size={14} /> : <CreditCard size={14} />}
                                {hasReceipt ? "Soporte" : "Adjuntar"}
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
          )}
        </>
      )}

      {/* ─── PESTAÑA 2: EMPLEADOS / COLABORADORES ───────────────────────────────── */}
      {activeTab === "employees" && (
        <>
          {/* Barra de Filtros de Colaboradores */}
          <div
            style={{
              background: "var(--bg-card-subtle, rgba(255,255,255,0.03))",
              border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
              borderRadius: 10,
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            {canSeeAll && (
              <label className="field" style={{ margin: 0, minWidth: 160 }}>
                <span>Sede</span>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  style={{ height: 38 }}
                >
                  <option value="">Todas las Sedes</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <span>Buscar Colaborador</span>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Nombre, cédula, cargo o código..."
                  style={{ height: 38, paddingLeft: 30 }}
                />
                <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "var(--text-muted)" }} />
              </div>
            </label>

            <button
              type="button"
              className="inv-btn inv-btn--primary"
              style={{ height: 38, alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              onClick={() => {
                setEmployeeToEdit(null);
                setShowCreateEmployee(true);
              }}
            >
              <Plus size={16} /> Crear Colaborador
            </button>
          </div>

          {/* Tabla de Colaboradores */}
          {employees.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                background: "var(--bg-card, #1e293b)",
                borderRadius: 10,
                border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.1))",
              }}
            >
              <Users size={40} className="text-muted" style={{ margin: "0 auto 0.75rem auto", opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No hay colaboradores registrados</p>
              <p style={{ margin: "4px 0 1rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Registra los colaboradores de la empresa para liquidar sus nóminas.
              </p>
              <button
                type="button"
                className="inv-btn inv-btn--primary"
                onClick={() => {
                  setEmployeeToEdit(null);
                  setShowCreateEmployee(true);
                }}
              >
                <Plus size={16} /> Registrar Colaborador
              </button>
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-card, #1e293b)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                borderRadius: 10,
                overflowX: "auto",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", textAlign: "left", background: "rgba(255, 255, 255, 0.02)" }}>
                    <th style={{ padding: "10px 14px" }}>Código</th>
                    <th style={{ padding: "10px 14px" }}>Colaborador</th>
                    <th style={{ padding: "10px 14px" }}>Cargo</th>
                    <th style={{ padding: "10px 14px" }}>Sede Asignada</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Sueldo Base</th>
                    <th style={{ padding: "10px 14px" }}>Periodicidad</th>
                    <th style={{ padding: "10px 14px" }}>Cuenta Bancaria</th>
                    <th style={{ padding: "10px 14px" }}>Estado</th>
                    <th style={{ padding: "10px 14px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                        opacity: emp.isActive ? 1 : 0.6,
                      }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#38bdf8" }}>
                        {emp.code}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{emp.fullName}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {emp.documentType} {emp.documentNumber} {emp.phone && `· ${emp.phone}`}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{emp.position}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {emp.warehouseName ? (
                          <span style={{ fontSize: "0.8rem", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                            {emp.warehouseName} ({emp.warehouseCode})
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Sin sede fija</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>
                        {formatMoney(emp.baseSalary)}
                      </td>
                      <td style={{ padding: "10px 14px", textTransform: "capitalize" }}>
                        {emp.paymentFrequency}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {emp.bankName ? (
                          <div style={{ fontSize: "0.8rem" }}>
                            <div><strong>{emp.bankName}</strong> ({emp.bankAccountType ?? "Cta"})</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{emp.bankAccountNumber ?? "—"}</div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Efectivo</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {emp.isActive ? (
                          <span style={{ color: "#10b981", fontSize: "0.75rem", fontWeight: 700, background: "rgba(16, 185, 129, 0.1)", padding: "2px 6px", borderRadius: 4 }}>
                            Activo
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.75rem", background: "rgba(255, 255, 255, 0.05)", padding: "2px 6px", borderRadius: 4 }}>
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                          <button
                            type="button"
                            className="inv-btn inv-btn--ghost"
                            style={{ padding: "4px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                            onClick={() => {
                              setEmployeeToEdit(emp);
                              setShowCreateEmployee(true);
                            }}
                            title="Editar Colaborador"
                          >
                            <Edit2 size={13} /> Editar
                          </button>
                          {emp.isActive && (
                            <button
                              type="button"
                              className="inv-btn inv-btn--primary"
                              style={{ padding: "4px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                              onClick={() => {
                                setPreselectedEmployeeId(emp.id);
                                setShowCreatePayment(true);
                              }}
                              title="Pagar nómina a este colaborador"
                            >
                              <DollarSign size={13} /> Pagar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            // Abrir automáticamente el voucher para imprimir
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
