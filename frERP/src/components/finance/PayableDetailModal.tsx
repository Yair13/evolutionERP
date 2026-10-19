import { useState, useEffect, useCallback } from "react";
import { fetchPayableDetail, type PayableDetail, type PayableSummaryItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { FileText, X, Wallet, CreditCard, Building2, Calendar } from "lucide-react";

type Props = {
  open: boolean;
  payableId: string | null;
  onClose: () => void;
  onAbonar: (payable: PayableSummaryItem) => void;
};

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

export function PayableDetailModal({ open, payableId, onClose, onAbonar }: Props) {
  const { token } = useAuth();
  const [detail, setDetail] = useState<PayableDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !payableId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPayableDetail(token, payableId);
      setDetail(res.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la cuenta por pagar.");
    } finally {
      setLoading(false);
    }
  }, [token, payableId]);

  useEffect(() => {
    if (open && payableId) {
      void loadData();
    } else {
      setDetail(null);
    }
  }, [open, payableId, loadData]);

  if (!open) return null;

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="payable-detail-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileText size={20} color="#f59e0b" />
            <h2 id="payable-detail-title" className="inv-modal__title">
              Cuenta por Pagar {detail?.billNumber ? `· Factura ${detail.billNumber}` : ""}
            </h2>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="inv-modal__body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error && <div className="inv-form-error">{error}</div>}

          {loading || !detail ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--inv-text-muted)" }}>
              Cargando información...
            </div>
          ) : (
            <>
              {/* Información General */}
              <div
                style={{
                  background: "var(--inv-bg-elevated)",
                  borderRadius: 8,
                  padding: "1rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Proveedor
                  </span>
                  <div style={{ fontWeight: 700, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Building2 size={16} color="#6366f1" />
                    {detail.supplierName}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)" }}>
                    NIT: {detail.supplierTaxId || "—"} · Tel: {detail.supplierPhone || "—"}
                  </div>
                  {detail.supplierCreditBalance > 0 && (
                    <div style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: 600, marginTop: "0.25rem" }}>
                      💰 Saldo a favor de la empresa: {formatMoney(detail.supplierCreditBalance)}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Sede y Fechas
                  </span>
                  <div style={{ fontWeight: 600 }}>{detail.warehouseName} ({detail.warehouseCode})</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)", marginTop: "0.2rem" }}>
                    Factura: {detail.issueDate || formatDate(detail.createdAt)}
                  </div>
                  {detail.dueDate && (
                    <div style={{ fontSize: "0.85rem", color: "#f59e0b", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Calendar size={13} />
                      Vence: {detail.dueDate}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Estado
                  </span>
                  <div style={{ marginTop: "0.25rem" }}>
                    {detail.status === "open" && (
                      <span className="badge badge--warning" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                        Pendiente
                      </span>
                    )}
                    {detail.status === "partial" && (
                      <span className="badge badge--primary" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}>
                        Abono parcial
                      </span>
                    )}
                    {detail.status === "paid" && (
                      <span className="badge badge--success" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                        Pagada
                      </span>
                    )}
                  </div>
                  {detail.createdByName && (
                    <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem" }}>
                      Registrado por: {detail.createdByName}
                    </div>
                  )}
                </div>
              </div>

              {/* Datos Bancarios si existen */}
              {detail.supplierBankInfo?.bankName && (
                <div
                  style={{
                    padding: "0.6rem 0.8rem",
                    background: "rgba(99, 102, 241, 0.05)",
                    border: "1px dashed rgba(99, 102, 241, 0.3)",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <CreditCard size={18} color="#818cf8" />
                  <div>
                    Datos para pago: <strong>{detail.supplierBankInfo.bankName}</strong> ({detail.supplierBankInfo.accountType}):{" "}
                    <strong>{detail.supplierBankInfo.accountNumber}</strong>
                  </div>
                </div>
              )}

              {/* Totales */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.75rem",
                  background: "rgba(245, 158, 11, 0.05)",
                  padding: "0.85rem 1rem",
                  borderRadius: 8,
                  border: "1px solid rgba(245, 158, 11, 0.15)",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>Total Factura</span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {formatMoney(detail.totalAmount)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>Total Pagado</span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#10b981" }}>
                    {formatMoney(detail.paidAmount)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>Saldo Pendiente</span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: detail.balanceAmount === 0 ? "#10b981" : "#f59e0b" }}>
                    {formatMoney(detail.balanceAmount)}
                  </div>
                </div>
              </div>

              {detail.description && (
                <div style={{ fontSize: "0.88rem", padding: "0.6rem 0.8rem", background: "var(--inv-bg-field)", borderRadius: 6 }}>
                  <span style={{ fontWeight: 600, color: "var(--inv-text-muted)" }}>Concepto: </span>
                  {detail.description}
                </div>
              )}

              {/* Comprobantes de Egreso / Pagos */}
              <div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
                  Comprobantes de Egreso y Salidas de Dinero ({detail.payments.length})
                </h3>

                {detail.payments.length === 0 ? (
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)", fontStyle: "italic" }}>
                    No se han registrado pagos para esta cuenta.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="inv-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Comprobante</th>
                          <th>Fecha</th>
                          <th>Medio de Pago</th>
                          <th>Monto Salida</th>
                          <th>Ref. Transacción</th>
                          <th>Registrado por</th>
                          <th>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong style={{ color: "#818cf8" }}>{p.receiptNumber}</strong>
                            </td>
                            <td>{formatDate(p.createdAt)}</td>
                            <td style={{ textTransform: "capitalize" }}>{p.paymentMethod}</td>
                            <td style={{ fontWeight: 700, color: "#10b981" }}>
                              {formatMoney(p.amount)}
                            </td>
                            <td>{p.referenceCode || "—"}</td>
                            <td>{p.createdByName || "—"}</td>
                            <td>{p.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="inv-modal__actions" style={{ marginTop: "0.5rem" }}>
                <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
                  Cerrar
                </button>
                {detail.status !== "paid" && detail.status !== "cancelled" && (
                  <button
                    type="button"
                    className="inv-btn inv-btn--primary"
                    onClick={() => {
                      onAbonar(detail);
                    }}
                  >
                    <Wallet size={16} style={{ marginRight: 4 }} />
                    Registrar Pago / Salida de Dinero
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
