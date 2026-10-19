import { useState, useEffect, useCallback } from "react";
import {
  fetchCashOutflows,
  fetchCashTransfers,
  approveCashTransfer,
  rejectCashTransfer,
  type CashOutflowItem,
  type CashTransferItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { CreateEgressVoucherModal } from "../../components/finance/CreateEgressVoucherModal.js";
import { CreateCashTransferModal } from "../../components/finance/CreateCashTransferModal.js";
import { PrintEgressVoucherModal } from "../../components/finance/PrintEgressVoucherModal.js";
import {
  FileMinus,
  ArrowLeftRight,
  PlusCircle,
  Search,
  Printer,
  CheckCircle2,
  Clock,
  Building2,
  ArrowRight,
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
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashOutflowsPage() {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, setWarehouseId } = useWarehouse();

  const [activeTab, setActiveTab] = useState<"outflows" | "transfers">("outflows");

  // Filtros de Egresos
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(warehouseId || "");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [searchOutflows, setSearchOutflows] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Datos de Egresos
  const [outflows, setOutflows] = useState<CashOutflowItem[]>([]);
  const [totalOutflows, setTotalOutflows] = useState(0);
  const [totalOutflowsAmount, setTotalOutflowsAmount] = useState(0);
  const [outflowsPage, setOutflowsPage] = useState(1);
  const limit = 25;

  // Datos de Traslados
  const [transfers, setTransfers] = useState<CashTransferItem[]>([]);
  const [totalTransfers, setTotalTransfers] = useState(0);
  const [incomingTransfers, setIncomingTransfers] = useState<CashTransferItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modales
  const [openCreateOutflow, setOpenCreateOutflow] = useState(false);
  const [openCreateTransfer, setOpenCreateTransfer] = useState(false);
  const [voucherToPrint, setVoucherToPrint] = useState<CashOutflowItem | null>(null);

  // Cargar Egresos
  const loadOutflows = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCashOutflows(token, {
        warehouseId: selectedWarehouse || null,
        paymentMethod: paymentMethod || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        q: searchOutflows.trim() || null,
        limit,
        offset: (outflowsPage - 1) * limit,
      });
      setOutflows(res.items);
      setTotalOutflows(res.total);
      setTotalOutflowsAmount(res.totalAmount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los comprobantes de egreso.");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouse, paymentMethod, dateFrom, dateTo, searchOutflows, outflowsPage]);

  // Cargar Traslados
  const loadTransfers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCashTransfers(token, {
        warehouseId: selectedWarehouse || null,
        limit: 50,
      });
      setTransfers(res.items);
      setTotalTransfers(res.total);

      // Filtrar los que están pendientes de recibir en la sede actual seleccionada
      if (warehouseId) {
        setIncomingTransfers(
          res.items.filter(
            (t) => t.destinationWarehouseId === warehouseId && t.status === "pending"
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los traslados de dinero.");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouse, warehouseId]);

  useEffect(() => {
    if (activeTab === "outflows") {
      void loadOutflows();
    } else {
      void loadTransfers();
    }
  }, [activeTab, loadOutflows, loadTransfers]);

  // Cargar siempre traslados entrantes para la alerta
  useEffect(() => {
    if (!token || !warehouseId) return;
    fetchCashTransfers(token, {
      warehouseId,
      role: "destination",
      status: "pending",
      limit: 10,
    })
      .then((res) => {
        setIncomingTransfers(res.items);
      })
      .catch((err) => console.error("Error al cargar traslados entrantes:", err));
  }, [token, warehouseId]);

  async function handleApproveTransfer(t: CashTransferItem) {
    if (!token) return;
    try {
      await approveCashTransfer(token, t.id);
      setActionSuccess(`¡Traslado ${t.code} recibido y depositado en caja con éxito!`);
      void loadTransfers();
      setIncomingTransfers((prev) => prev.filter((item) => item.id !== t.id));
      window.setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar traslado.");
    }
  }

  async function handleRejectTransfer(t: CashTransferItem) {
    const reason = window.prompt("Indica el motivo del rechazo del dinero:");
    if (!reason || !reason.trim() || !token) return;

    try {
      await rejectCashTransfer(token, t.id, reason.trim());
      setActionSuccess(`Traslado ${t.code} rechazado.`);
      void loadTransfers();
      setIncomingTransfers((prev) => prev.filter((item) => item.id !== t.id));
      window.setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al rechazar traslado.");
    }
  }

  const totalPages = Math.ceil(totalOutflows / limit) || 1;

  return (
    <div className="inv-page">
      {/* Header */}
      <div className="inv-page__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileMinus size={28} color="#ef4444" />
            <h1 className="inv-page__title">Salidas de Dinero y Traslados entre Sedes</h1>
          </div>
          <p className="inv-page__subtitle">
            Emisión de comprobantes de egreso con firma, gastos operativos y remesas de efectivo entre sucursales.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            onClick={() => setOpenCreateTransfer(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <ArrowLeftRight size={17} />
            Trasladar Dinero
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={() => setOpenCreateOutflow(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <PlusCircle size={17} />
            Nuevo Comprobante de Egreso
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(16, 185, 129, 0.15)", border: "1px solid #10b981", borderRadius: 8, color: "#10b981", fontWeight: 600, margin: "1rem 0" }}>
          {actionSuccess}
        </div>
      )}

      {/* ALERTA DE TRASLADOS ENTRANTES PENDIENTES DE RECIBIR */}
      {incomingTransfers.length > 0 && (
        <div
          style={{
            background: "rgba(99, 102, 241, 0.1)",
            border: "1.5px solid #6366f1",
            borderRadius: 10,
            padding: "1rem 1.25rem",
            margin: "1rem 0 1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#818cf8", fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            <Clock size={20} />
            <span>Tienes {incomingTransfers.length} traslado(s) de dinero entrante(s) pendiente(s) por recibir en esta sede</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {incomingTransfers.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "var(--inv-bg-elevated)",
                  borderRadius: 8,
                  padding: "0.75rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  border: "1px solid var(--inv-border)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong style={{ color: "#6366f1" }}>{t.code}</strong>
                    <span>· Enviado desde: <strong>{t.originWarehouseName}</strong></span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)", marginTop: "0.2rem" }}>
                    Transportado por: <strong>{t.carrierName}</strong> {t.carrierDoc ? `(CC: ${t.carrierDoc})` : ""} · Motivo: {t.concept}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#10b981" }}>
                    {formatMoney(t.amount)}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="inv-btn inv-btn--primary"
                      onClick={() => void handleApproveTransfer(t)}
                      style={{ padding: "6px 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <CheckCircle2 size={15} />
                      Aprobar y Recibir en Caja
                    </button>
                    <button
                      type="button"
                      className="inv-btn inv-btn--ghost"
                      onClick={() => void handleRejectTransfer(t)}
                      style={{ padding: "6px 10px", fontSize: "0.82rem", color: "#ef4444" }}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--inv-border)", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("outflows")}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "outflows" ? "2px solid #ef4444" : "2px solid transparent",
            color: activeTab === "outflows" ? "#ef4444" : "var(--inv-text-muted)",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          Comprobantes de Egreso (Salidas)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transfers")}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "transfers" ? "2px solid #ef4444" : "2px solid transparent",
            color: activeTab === "transfers" ? "#ef4444" : "var(--inv-text-muted)",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          Traslados de Dinero entre Sedes {totalTransfers > 0 ? `(${totalTransfers})` : ""}
        </button>
      </div>

      {activeTab === "outflows" && (
        <>
          {/* KPI Summary */}
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
                <span>Total Egresos Desembolsados</span>
                <FileMinus size={18} color="#ef4444" />
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#ef4444", marginTop: "0.5rem" }}>
                {formatMoney(totalOutflowsAmount)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                {totalOutflows} comprobantes emitidos
              </div>
            </div>

            <div style={{ background: "var(--inv-bg-elevated)", padding: "1.25rem", borderRadius: 10, border: "1px solid var(--inv-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--inv-text-muted)", fontSize: "0.85rem" }}>
                <span>Sede Seleccionada</span>
                <Building2 size={18} color="#6366f1" />
              </div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.5rem" }}>
                {selectedWarehouse ? (warehouses.find((w) => w.id === selectedWarehouse)?.name || "Sede") : "Todas las sedes"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                Control de salidas y caja menor
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
                  setOutflowsPage(1);
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

            {/* Medio de Pago */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 140 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>MEDIO DE PAGO</span>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setOutflowsPage(1);
                }}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
              >
                <option value="">Todos los medios</option>
                <option value="efectivo">Efectivo</option>
                <option value="bancolombia">Bancolombia</option>
                <option value="davivienda">Davivienda</option>
                <option value="nequi">Nequi</option>
                <option value="daviplata">Daviplata</option>
                <option value="bold">Bold</option>
              </select>
            </label>

            {/* Búsqueda */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, minWidth: 200 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", fontWeight: 600 }}>BUSCAR COMPROBANTE / BENEFICIARIO</span>
              <div style={{ position: "relative" }}>
                <input
                  value={searchOutflows}
                  onChange={(e) => {
                    setSearchOutflows(e.target.value);
                    setOutflowsPage(1);
                  }}
                  placeholder="N° comprobante, persona, concepto..."
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
                  setOutflowsPage(1);
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
                  setOutflowsPage(1);
                }}
                style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
              />
            </label>
          </div>

          {error && <div className="inv-form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

          {/* Tabla de Egresos */}
          <div style={{ background: "var(--inv-bg-elevated)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--inv-border)" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="inv-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Comprobante</th>
                    <th>Fecha y Hora</th>
                    <th>Sede</th>
                    <th>Pagado a (Beneficiario)</th>
                    <th>Concepto</th>
                    <th>Proveedor</th>
                    <th>Medio</th>
                    <th>Valor Salida</th>
                    <th>Registrado por</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "2rem", color: "var(--inv-text-muted)" }}>
                        Cargando egresos...
                      </td>
                    </tr>
                  ) : outflows.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--inv-text-muted)" }}>
                        <Filter size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
                        <div>No se encontraron comprobantes de egreso con los filtros seleccionados.</div>
                      </td>
                    </tr>
                  ) : (
                    outflows.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong style={{ color: "#ef4444" }}>{item.voucherNumber}</strong>
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)" }}>
                          {formatDate(item.createdAt)}
                        </td>
                        <td>{item.warehouseName}</td>
                        <td>
                          <div>
                            <strong>{item.beneficiaryName}</strong>
                            {item.beneficiaryDoc && (
                              <div style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)" }}>
                                CC: {item.beneficiaryDoc}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.concept}>
                          {item.concept}
                        </td>
                        <td>
                          {item.supplierName ? (
                            <span style={{ fontSize: "0.82rem" }}>{item.supplierName}</span>
                          ) : (
                            <span style={{ color: "var(--inv-text-muted)", fontSize: "0.82rem" }}>—</span>
                          )}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>{item.paymentMethod}</td>
                        <td style={{ fontWeight: 700, color: "#ef4444" }}>
                          {formatMoney(item.amount)}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)" }}>
                          {item.createdByName || "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="inv-btn inv-btn--ghost"
                            style={{ padding: "4px 8px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 3 }}
                            onClick={() => setVoucherToPrint(item)}
                            title="Imprimir Voucher de Egreso"
                          >
                            <Printer size={14} />
                            Voucher
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

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
                  Página <strong>{outflowsPage}</strong> de <strong>{totalPages}</strong> ({totalOutflows} registros)
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    disabled={outflowsPage <= 1}
                    onClick={() => setOutflowsPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    disabled={outflowsPage >= totalPages}
                    onClick={() => setOutflowsPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "transfers" && (
        <>
          {/* Tabla de Traslados de Dinero */}
          <div style={{ background: "var(--inv-bg-elevated)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--inv-border)" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="inv-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Ruta (Sede Origen → Destino)</th>
                    <th>Monto Trasladado</th>
                    <th>Transportador / Mensajero</th>
                    <th>Concepto</th>
                    <th>Medio</th>
                    <th>Estado</th>
                    <th>Fecha Envío</th>
                    <th>Fecha Recepción</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "2rem", color: "var(--inv-text-muted)" }}>
                        Cargando traslados de dinero...
                      </td>
                    </tr>
                  ) : transfers.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--inv-text-muted)" }}>
                        <ArrowLeftRight size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
                        <div>No se han registrado traslados de dinero entre sedes.</div>
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong style={{ color: "#6366f1" }}>{t.code}</strong>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span>{t.originWarehouseName}</span>
                            <ArrowRight size={13} color="var(--inv-text-muted)" />
                            <strong>{t.destinationWarehouseName}</strong>
                          </div>
                        </td>
                        <td style={{ fontWeight: 800, color: "#10b981", fontSize: "0.95rem" }}>
                          {formatMoney(t.amount)}
                        </td>
                        <td>
                          <div>
                            <strong>{t.carrierName}</strong>
                            {t.carrierDoc && (
                              <div style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)" }}>
                                CC: {t.carrierDoc}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.concept}>
                          {t.concept}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>{t.paymentMethod}</td>
                        <td>
                          {t.status === "pending" && (
                            <span className="badge badge--warning" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                              En tránsito
                            </span>
                          )}
                          {t.status === "approved" && (
                            <span className="badge badge--success" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                              Recibido en caja
                            </span>
                          )}
                          {t.status === "rejected" && (
                            <span className="badge badge--neutral" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }} title={t.rejectionReason || ""}>
                              Rechazado
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)" }}>
                          {formatDate(t.createdAt)}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)" }}>
                          {t.approvedAt ? formatDate(t.approvedAt) : "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {t.status === "pending" && t.destinationWarehouseId === warehouseId && (
                            <div style={{ display: "inline-flex", gap: "0.3rem" }}>
                              <button
                                type="button"
                                className="inv-btn inv-btn--primary"
                                style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                                onClick={() => void handleApproveTransfer(t)}
                              >
                                Recibir
                              </button>
                              <button
                                type="button"
                                className="inv-btn inv-btn--ghost"
                                style={{ padding: "4px 8px", fontSize: "0.78rem", color: "#ef4444" }}
                                onClick={() => void handleRejectTransfer(t)}
                              >
                                Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Crear Comprobante de Egreso */}
      <CreateEgressVoucherModal
        open={openCreateOutflow}
        onClose={() => setOpenCreateOutflow(false)}
        onSuccess={(outflow) => {
          void loadOutflows();
          setVoucherToPrint(outflow);
        }}
      />

      {/* Modal Crear Traslado de Dinero */}
      <CreateCashTransferModal
        open={openCreateTransfer}
        onClose={() => setOpenCreateTransfer(false)}
        onSuccess={() => {
          void loadTransfers();
          setActionSuccess("Traslado de dinero registrado. Se ha enviado notificación a la sede destino.");
          window.setTimeout(() => setActionSuccess(null), 4000);
        }}
      />

      {/* Modal Imprimir Voucher de Egreso */}
      {voucherToPrint && (
        <PrintEgressVoucherModal
          open={Boolean(voucherToPrint)}
          outflow={voucherToPrint}
          onClose={() => setVoucherToPrint(null)}
        />
      )}
    </div>
  );
}
