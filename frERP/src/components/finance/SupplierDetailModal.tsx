import { useState, useEffect, useCallback } from "react";
import {
  fetchSupplierProfile,
  deleteSupplier,
  type SupplierProfile,
  type SupplierItem,
  type PayableSummaryItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { formatBogotaDateTime, formatBogotaDate } from "../../lib/dateUtils.js";
import {
  Building2,
  X,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Clock,
  CheckCircle2,
  Wallet,
  Receipt,
  Edit2,
  Trash2,
  RefreshCw,
  PlusCircle,
  FileText,
  Paperclip,
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatBogotaDate(iso);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatBogotaDateTime(iso);
}

type Props = {
  open: boolean;
  supplierId: string | null;
  onClose: () => void;
  onEditSupplier: (supplier: SupplierItem) => void;
  onPagarFactura: (payable: PayableSummaryItem) => void;
  onNuevaFactura: (supplierId: string) => void;
  onViewReceiptPhoto?: (url: string) => void;
};

export function SupplierDetailModal({
  open,
  supplierId,
  onClose,
  onEditSupplier,
  onPagarFactura,
  onNuevaFactura,
  onViewReceiptPhoto,
}: Props) {
  const { token } = useAuth();
  const { isAllWarehouses } = useWarehouse();

  const handleDelete = async () => {
    if (!profile) return;
    if (!isAllWarehouses) {
      alert("Solo se pueden eliminar proveedores desde la Sede Administrativa.");
      return;
    }
    const ok = window.confirm(
      `¿Estás seguro de que deseas eliminar al proveedor "${profile.supplier.name}"?\n\n` +
      `Esta acción solo está permitida desde la Sede Administrativa.\n` +
      `• Si no tiene facturas ni comprobantes registrados, se eliminará definitivamente.\n` +
      `• Si tiene historial comercial cerrado, se archivará para proteger la contabilidad.\n` +
      `• No podrá eliminarse si tiene cuentas pendientes de pago o saldos a favor.`
    );
    if (!ok) return;

    try {
      const res = await deleteSupplier(token!, profile.supplier.id);
      alert(res.message || "Proveedor eliminado con éxito.");
      onClose();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar el proveedor.");
    }
  };
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"payables" | "payments">("payables");

  const loadProfile = useCallback(async () => {
    if (!token || !supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupplierProfile(token, supplierId);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar estado de cuenta del proveedor.");
    } finally {
      setLoading(false);
    }
  }, [token, supplierId]);

  useEffect(() => {
    if (open && supplierId) {
      void loadProfile();
    } else {
      setProfile(null);
    }
  }, [open, supplierId, loadProfile]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !supplierId) return null;

  return (
    <div
      className="inv-modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="inv-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 960,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          borderRadius: 20,
          background: "#ffffff",
          color: "#0f172a",
          boxShadow: "0 25px 60px -15px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(15, 23, 42, 0.08)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "rgba(99, 102, 241, 0.1)",
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Building2 size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.25,
                  }}
                >
                  {profile?.supplier.name || "Cargando proveedor…"}
                </h2>
                {profile?.supplier.creditBalance ? (
                  profile.supplier.creditBalance > 0 && (
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#059669",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      💰 Saldo a Favor: {formatMoney(profile.supplier.creditBalance)}
                    </span>
                  )
                ) : null}
              </div>

              {profile && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "6px",
                    fontSize: "0.83rem",
                    color: "#64748b",
                  }}
                >
                  <span>NIT/CC: <strong style={{ color: "#334155" }}>{profile.supplier.taxId || "—"}</strong></span>
                  {profile.supplier.contactName && (
                    <span>· Contacto: <strong style={{ color: "#334155" }}>{profile.supplier.contactName}</strong></span>
                  )}
                  {profile.supplier.phone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Phone size={13} /> {profile.supplier.phone}
                    </span>
                  )}
                  {profile.supplier.email && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Mail size={13} /> {profile.supplier.email}
                    </span>
                  )}
                  {profile.supplier.address && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <MapPin size={13} /> {profile.supplier.address} {profile.supplier.city ? `(${profile.supplier.city})` : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {profile && (
              <>
                <button
                  type="button"
                  className="fin-btn fin-btn--ghost fin-btn--sm"
                  onClick={() => onEditSupplier(profile.supplier)}
                  title="Editar datos personales y bancarios"
                >
                  <Edit2 size={14} />
                  <span>Editar Datos</span>
                </button>
                <button
                  type="button"
                  className="fin-btn fin-btn--primary fin-btn--sm"
                  onClick={() => onNuevaFactura(profile.supplier.id)}
                  title="Registrar nueva factura por pagar"
                >
                  <PlusCircle size={14} />
                  <span>Nueva Factura</span>
                </button>
                {isAllWarehouses && (
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    onClick={() => void handleDelete()}
                    title="Eliminar proveedor (solo Sede Administrativa)"
                    style={{ color: "#dc2626", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <Trash2 size={14} />
                    <span>Eliminar Proveedor</span>
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="inv-modal__close"
              onClick={onClose}
              title="Cerrar (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b" }}>
              <RefreshCw size={28} className="spin" style={{ margin: "0 auto 0.5rem" }} />
              <div>Cargando estado de cuenta del proveedor…</div>
            </div>
          ) : error ? (
            <div className="fin-alert fin-alert--danger">{error}</div>
          ) : profile ? (
            <>
              {/* KPI Summary Cards */}
              <div className="fin-kpi-grid fin-kpi-grid--4" style={{ marginBottom: "1.25rem" }}>
                <div className="fin-kpi-card fin-kpi-card--amber" style={{ padding: "1rem" }}>
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#d97706" }}>Deuda Pendiente Actual</span>
                    <div className="fin-kpi-icon fin-kpi-icon--amber">
                      <Clock size={16} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--amber" style={{ fontSize: "1.4rem" }}>
                    {formatMoney(profile.stats.currentDebt)}
                  </div>
                  <div className="fin-kpi-sub">
                    {profile.payables.filter((p) => p.status === "open" || p.status === "partial").length} factura(s) por pagar
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--indigo" style={{ padding: "1rem" }}>
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Total Facturado</span>
                    <div className="fin-kpi-icon fin-kpi-icon--indigo">
                      <FileText size={16} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--indigo" style={{ fontSize: "1.4rem" }}>
                    {formatMoney(profile.stats.totalBilled)}
                  </div>
                  <div className="fin-kpi-sub">
                    {profile.payables.length} factura(s) registradas
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--emerald" style={{ padding: "1rem" }}>
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#059669" }}>Total Pagado</span>
                    <div className="fin-kpi-icon fin-kpi-icon--emerald">
                      <CheckCircle2 size={16} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--emerald" style={{ fontSize: "1.4rem" }}>
                    {formatMoney(profile.stats.totalPaid)}
                  </div>
                  <div className="fin-kpi-sub">
                    {profile.recentPayments.length} abono(s) / comprobante(s)
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--teal" style={{ padding: "1rem" }}>
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "var(--accent)" }}>Saldo a Favor Empresa</span>
                    <div className="fin-kpi-icon fin-kpi-icon--teal">
                      <Wallet size={16} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--teal" style={{ fontSize: "1.4rem" }}>
                    {formatMoney(profile.stats.creditBalance)}
                  </div>
                  <div className="fin-kpi-sub">
                    Excedentes disponibles para abonar
                  </div>
                </div>
              </div>

              {/* Datos Bancarios del Proveedor */}
              {profile.supplier.bankName && (
                <div
                  style={{
                    padding: "0.85rem 1.15rem",
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid var(--border-color)",
                    marginBottom: "1.25rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <CreditCard size={18} color="var(--accent)" />
                    <span style={{ fontSize: "0.86rem", color: "#334155" }}>
                      Cuenta para Transferencias: <strong>{profile.supplier.bankName}</strong> ({profile.supplier.bankAccountType || "Ahorros"}):{" "}
                      <strong style={{ letterSpacing: "0.03em" }}>{profile.supplier.bankAccountNumber}</strong>
                    </span>
                  </div>
                  {profile.supplier.notes && (
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      Nota: {profile.supplier.notes}
                    </span>
                  )}
                </div>
              )}

              {/* Desglose por sedes / bodegas */}
              {profile.warehouseBreakdown && profile.warehouseBreakdown.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: "8px",
                    }}
                  >
                    Resumen de Deuda y Facturación por Sede
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {profile.warehouseBreakdown.map((wh) => (
                      <div
                        key={wh.warehouseId}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid var(--border-color)",
                          background: wh.currentDebt > 0 ? "rgba(245, 158, 11, 0.05)" : "#f8fafc",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>
                            {wh.warehouseName} ({wh.warehouseCode})
                          </strong>
                          {wh.openPayablesCount > 0 && (
                            <span className="fin-badge fin-badge--warning" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                              {wh.openPayablesCount} pend.
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ color: "#64748b" }}>Deuda Sede:</span>
                          <strong style={{ color: wh.currentDebt > 0 ? "#d97706" : "#059669" }}>
                            {formatMoney(wh.currentDebt)}
                          </strong>
                        </div>
                        <div style={{ marginTop: "2px", display: "flex", justifyContent: "space-between", fontSize: "0.76rem", color: "#64748b" }}>
                          <span>Facturado: {formatMoney(wh.totalBilled)}</span>
                          <span>Pagado: {formatMoney(wh.totalPaid)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-tabs: Facturas vs Pagos */}
              <div className="fin-tabs" style={{ marginBottom: "1rem" }}>
                <button
                  type="button"
                  className={`fin-tab ${activeTab === "payables" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("payables")}
                >
                  <Clock size={15} />
                  <span>Facturas y Cuentas por Pagar</span>
                  <span className="fin-tab__badge">{profile.payables.length}</span>
                </button>
                <button
                  type="button"
                  className={`fin-tab ${activeTab === "payments" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("payments")}
                >
                  <Receipt size={15} />
                  <span>Historial de Pagos / Comprobantes (CE)</span>
                  <span className="fin-tab__badge">{profile.recentPayments.length}</span>
                </button>
              </div>

              {/* TAB 1: Facturas */}
              {activeTab === "payables" && (
                <div className="fin-table-card" style={{ boxShadow: "none", border: "1px solid var(--border-color)" }}>
                  <div className="fin-table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>N° Factura</th>
                          <th>Sede</th>
                          <th>Emisión / Vence</th>
                          <th style={{ textAlign: "right" }}>Total</th>
                          <th style={{ textAlign: "right" }}>Pagado</th>
                          <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                          <th style={{ textAlign: "center" }}>Estado</th>
                          <th style={{ textAlign: "right" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.payables.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                              No hay facturas registradas para este proveedor.
                            </td>
                          </tr>
                        ) : (
                          profile.payables.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <strong style={{ color: "#0f172a" }}>{item.billNumber || "S/N"}</strong>
                                {item.description && (
                                  <div style={{ fontSize: "0.75rem", color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.description}>
                                    {item.description}
                                  </div>
                                )}
                              </td>
                              <td style={{ fontSize: "0.82rem" }}>
                                {item.warehouseName}
                              </td>
                              <td>
                                <div style={{ fontSize: "0.8rem", color: "#0f172a" }}>
                                  {formatDate(item.issueDate || item.createdAt)}
                                </div>
                                {item.dueDate && (
                                  <div style={{ fontSize: "0.74rem", color: "#d97706" }}>
                                    Vence: {item.dueDate}
                                  </div>
                                )}
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
                              <td style={{ textAlign: "right" }}>
                                {item.status !== "paid" && item.status !== "cancelled" ? (
                                  <button
                                    type="button"
                                    className="fin-btn fin-btn--primary fin-btn--sm"
                                    onClick={() => onPagarFactura(item)}
                                    title="Pagar / Registrar Egreso"
                                  >
                                    <Wallet size={13} />
                                    <span>Pagar</span>
                                  </button>
                                ) : (
                                  <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 600 }}>Al día</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: Pagos / Comprobantes */}
              {activeTab === "payments" && (
                <div className="fin-table-card" style={{ boxShadow: "none", border: "1px solid var(--border-color)" }}>
                  <div className="fin-table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Comprobante</th>
                          <th>Factura Asociada</th>
                          <th>Sede</th>
                          <th>Fecha y Hora</th>
                          <th>Método</th>
                          <th style={{ textAlign: "right" }}>Abonado</th>
                          <th style={{ textAlign: "right" }}>Excedente</th>
                          <th>Soporte / Foto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.recentPayments.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                              No hay pagos registrados para este proveedor.
                            </td>
                          </tr>
                        ) : (
                          profile.recentPayments.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <strong style={{ color: "#0f172a" }}>{p.receiptNumber}</strong>
                                {p.createdByName && (
                                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                    Por: {p.createdByName}
                                  </div>
                                )}
                              </td>
                              <td>
                                <strong style={{ color: "#334155" }}>{p.billNumber || "—"}</strong>
                              </td>
                              <td style={{ fontSize: "0.82rem" }}>
                                {p.warehouseName || p.warehouseCode || "—"}
                              </td>
                              <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                {formatDateTime(p.createdAt)}
                              </td>
                              <td>
                                <span className="fin-badge fin-badge--neutral" style={{ textTransform: "capitalize" }}>
                                  {p.paymentMethod}
                                </span>
                                {p.referenceCode && (
                                  <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                                    Ref: {p.referenceCode}
                                  </div>
                                )}
                              </td>
                              <td className="fin-table-num" style={{ color: "#059669" }}>
                                <strong>{formatMoney(p.appliedToDebt || p.amount)}</strong>
                              </td>
                              <td className="fin-table-num">
                                {p.excessToFavour > 0 ? (
                                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                                    +{formatMoney(p.excessToFavour)}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8" }}>—</span>
                                )}
                              </td>
                              <td>
                                {p.receiptUrl ? (
                                  <button
                                    type="button"
                                    className="fin-btn fin-btn--ghost fin-btn--sm"
                                    onClick={() => onViewReceiptPhoto && onViewReceiptPhoto(p.receiptUrl!)}
                                    title="Ver comprobante"
                                  >
                                    <Paperclip size={13} />
                                    <span>Ver Foto</span>
                                  </button>
                                ) : (
                                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Sin soporte</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid rgba(15, 23, 42, 0.08)",
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
            Proveedor ID: <code style={{ fontSize: "0.78rem" }}>{supplierId}</code>
          </div>
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={onClose}
          >
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
}
