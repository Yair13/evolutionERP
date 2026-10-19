import { useEffect, useState } from "react";
import { fetchReceivableDetail, type ReceivableDetail } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { Package, Receipt, X } from "lucide-react";

type Props = {
  open: boolean;
  receivableId: string | null;
  onClose: () => void;
  onOpenAddPayment: (detail: ReceivableDetail) => void;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ReceivableDetailModal({
  open,
  receivableId,
  onClose,
  onOpenAddPayment,
}: Props) {
  const { token } = useAuth();
  const [detail, setDetail] = useState<ReceivableDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !receivableId || !token) return;
    setLoading(true);
    setError(null);
    fetchReceivableDetail(token, receivableId)
      .then((res) => setDetail(res.item))
      .catch((err) => setError(err.message || "Error al cargar detalle"))
      .finally(() => setLoading(false));
  }, [open, receivableId, token]);

  if (!open || !receivableId) return null;

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal inv-modal--checkout"
        style={{ maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-labelledby="rec-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <h2 id="rec-detail-title" style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Receipt size={22} className="text-primary" />
              Detalle de Crédito · {detail?.invoiceNumber || "..."}
            </h2>
            {detail && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Sede: {detail.warehouseName} ({detail.warehouseCode}) · Creado el {formatDate(detail.createdAt)}
              </span>
            )}
          </div>
          <button type="button" className="inv-btn inv-btn--ghost" style={{ padding: 4 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando información...</div>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : detail ? (
          <div style={{ overflowY: "auto", flex: 1, paddingRight: "0.25rem" }}>
            {/* Tarjeta de Resumen Financiero */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 8, padding: "0.75rem", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Total Venta</span>
                <strong style={{ fontSize: "1.05rem" }}>{formatMoney(detail.totalAmount)}</strong>
              </div>
              <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8, padding: "0.75rem", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#10b981", display: "block" }}>Total Pagado</span>
                <strong style={{ fontSize: "1.05rem", color: "#10b981" }}>{formatMoney(detail.paidAmount)}</strong>
              </div>
              <div style={{ background: detail.balanceAmount > 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)", border: `1px solid ${detail.balanceAmount > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)"}`, borderRadius: 8, padding: "0.75rem", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: detail.balanceAmount > 0 ? "#ef4444" : "#10b981", display: "block" }}>Saldo Pendiente</span>
                <strong style={{ fontSize: "1.05rem", color: detail.balanceAmount > 0 ? "#ef4444" : "#10b981" }}>
                  {formatMoney(detail.balanceAmount)}
                </strong>
              </div>
              <div style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.25)", borderRadius: 8, padding: "0.75rem", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Estado</span>
                <strong style={{ fontSize: "0.95rem", textTransform: "capitalize", color: detail.status === "paid" ? "#10b981" : detail.status === "partial" ? "#f59e0b" : "#ef4444" }}>
                  {detail.status === "paid" ? "Pagado ✅" : detail.status === "partial" ? "Abono Parcial ⏳" : "Pendiente ⚠️"}
                </strong>
              </div>
            </div>

            {/* Datos del Cliente */}
            <div style={{ background: "var(--bg-card-subtle, rgba(255,255,255,0.03))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 8, padding: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Cliente:</span>
                  <div style={{ fontWeight: 600, fontSize: "1rem" }}>{detail.customerName}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    CC / NIT: {detail.customerTaxId || "—"} · Tel: {detail.customerPhone || "—"}
                  </div>
                </div>
                {detail.customerCreditBalance > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.75rem", color: "#10b981", display: "block" }}>Saldo a favor cliente</span>
                    <strong style={{ color: "#10b981" }}>{formatMoney(detail.customerCreditBalance)}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Productos de la venta */}
            {detail.documentLines && detail.documentLines.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Package size={16} /> Productos facturados
                </h4>
                <div style={{ border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 6, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                        <th style={{ padding: "6px 10px" }}>Producto</th>
                        <th style={{ padding: "6px 10px" }}>Ref</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Cant</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Precio Unit</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.documentLines.map((l, idx) => (
                        <tr key={idx} style={{ borderTop: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}>
                          <td style={{ padding: "6px 10px" }}>{l.productName}</td>
                          <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{l.referenceCode}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>{l.quantity}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>{formatMoney(l.unitSalePrice)}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>
                            {formatMoney(l.quantity * l.unitSalePrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Historial de Abonos / Pagos */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Receipt size={16} /> Historial de Abonos ({detail.payments.length})
                </h4>
                {detail.balanceAmount > 0 && (
                  <button
                    type="button"
                    className="inv-btn inv-btn--primary"
                    style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                    onClick={() => onOpenAddPayment(detail)}
                  >
                    + Registrar Abono
                  </button>
                )}
              </div>

              {detail.payments.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Aún no se han registrado abonos a este crédito.
                </p>
              ) : (
                <div style={{ border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 6, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                        <th style={{ padding: "6px 10px" }}>Recibo</th>
                        <th style={{ padding: "6px 10px" }}>Fecha</th>
                        <th style={{ padding: "6px 10px" }}>Método</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Abono</th>
                        <th style={{ padding: "6px 10px" }}>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((p) => (
                        <tr key={p.id} style={{ borderTop: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>{p.receiptNumber}</td>
                          <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{formatDate(p.createdAt)}</td>
                          <td style={{ padding: "6px 10px" }}>
                            <span style={{ textTransform: "capitalize", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                              {p.paymentMethod}
                            </span>
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>
                            {formatMoney(p.amount)}
                            {p.excessToFavour > 0 && (
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                ({formatMoney(p.appliedToDebt)} a deuda + {formatMoney(p.excessToFavour)} a favor)
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{p.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color, rgba(255,255,255,0.08))", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
            Cerrar
          </button>
          {detail && detail.balanceAmount > 0 && (
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={() => onOpenAddPayment(detail)}
            >
              Registrar Abono
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
