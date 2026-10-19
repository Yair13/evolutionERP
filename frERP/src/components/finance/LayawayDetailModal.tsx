import { useState, useEffect, useCallback } from "react";
import { fetchLayawayDetail, cancelLayaway, type LayawayDetail, type LayawaySummaryItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { Bookmark, X, Calendar, Wallet, AlertCircle, Ban } from "lucide-react";

type Props = {
  open: boolean;
  layawayId: string | null;
  onClose: () => void;
  onAbonar: (layaway: LayawaySummaryItem) => void;
  onRefresh: () => void;
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

export function LayawayDetailModal({
  open,
  layawayId,
  onClose,
  onAbonar,
  onRefresh,
}: Props) {
  const { token } = useAuth();
  const [detail, setDetail] = useState<LayawayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal confirmación de cancelación
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [refundToBalance, setRefundToBalance] = useState(true);
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadData = useCallback(async () => {
    if (!token || !layawayId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLayawayDetail(token, layawayId);
      setDetail(res.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el apartado.");
    } finally {
      setLoading(false);
    }
  }, [token, layawayId]);

  useEffect(() => {
    if (open && layawayId) {
      setShowCancelPrompt(false);
      setCancelNotes("");
      void loadData();
    } else {
      setDetail(null);
    }
  }, [open, layawayId, loadData]);

  if (!open) return null;

  async function handleCancelLayaway() {
    if (!token || !layawayId) return;
    setCancelling(true);
    try {
      await cancelLayaway(token, layawayId, {
        refundToCreditBalance: refundToBalance,
        notes: cancelNotes.trim() || undefined,
      });
      setShowCancelPrompt(false);
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar apartado.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="layaway-detail-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Bookmark size={20} color="#6366f1" />
            <h2 id="layaway-detail-title" className="inv-modal__title">
              Apartado {detail ? detail.code : "..."}
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
              Cargando información del apartado...
            </div>
          ) : (
            <>
              {/* Tarjeta de estado y sede */}
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
                    Cliente
                  </span>
                  <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{detail.customerName}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)" }}>
                    CC/NIT: {detail.customerTaxId || "—"} · Tel: {detail.customerPhone || "—"}
                  </div>
                  {detail.customerCreditBalance > 0 && (
                    <div style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: 600, marginTop: "0.25rem" }}>
                      💰 Saldo a favor: {formatMoney(detail.customerCreditBalance)}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Sede y Registro
                  </span>
                  <div style={{ fontWeight: 600 }}>{detail.warehouseName} ({detail.warehouseCode})</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)" }}>
                    Creado el {formatDate(detail.createdAt)}
                  </div>
                  {detail.createdByName && (
                    <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)" }}>
                      Por: {detail.createdByName}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Estado
                  </span>
                  <div style={{ marginTop: "0.25rem" }}>
                    {detail.status === "active" && (
                      <span className="badge badge--primary" style={{ background: "rgba(99, 102, 241, 0.2)", color: "#818cf8" }}>
                        Activo
                      </span>
                    )}
                    {detail.status === "completed" && (
                      <span className="badge badge--success" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>
                        Redimido en venta
                      </span>
                    )}
                    {detail.status === "cancelled" && (
                      <span className="badge badge--neutral" style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }}>
                        Cancelado
                      </span>
                    )}
                  </div>
                  {detail.expiryDate && (
                    <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Calendar size={13} />
                      Vence: {detail.expiryDate}
                    </div>
                  )}
                </div>
              </div>

              {/* Totales financieros */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.75rem",
                  background: "rgba(99, 102, 241, 0.05)",
                  padding: "0.85rem 1rem",
                  borderRadius: 8,
                  border: "1px solid rgba(99, 102, 241, 0.15)",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>Valor Total Meta</span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {formatMoney(detail.targetAmount)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>Total Abonado</span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#10b981" }}>
                    {formatMoney(detail.paidAmount)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "var(--inv-text-muted)" }}>Saldo Pendiente</span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: detail.remainingAmount === 0 ? "#10b981" : "#f59e0b" }}>
                    {formatMoney(detail.remainingAmount)}
                  </div>
                </div>
              </div>

              {detail.notes && (
                <div style={{ fontSize: "0.88rem", padding: "0.6rem 0.8rem", background: "var(--inv-bg-field)", borderRadius: 6 }}>
                  <span style={{ fontWeight: 600, color: "var(--inv-text-muted)" }}>Observaciones / Artículos: </span>
                  {detail.notes}
                </div>
              )}

              {/* Historial de Abonos / Recibos */}
              <div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
                  Historial de Abonos y Comprobantes ({detail.payments.length})
                </h3>

                {detail.payments.length === 0 ? (
                  <div style={{ fontSize: "0.85rem", color: "var(--inv-text-muted)", fontStyle: "italic" }}>
                    Aún no se han registrado abonos para este apartado.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="inv-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Recibo</th>
                          <th>Fecha</th>
                          <th>Medio</th>
                          <th>Monto</th>
                          <th>Registrado por</th>
                          <th>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.receiptNumber}</strong>
                            </td>
                            <td>{formatDate(p.createdAt)}</td>
                            <td style={{ textTransform: "capitalize" }}>{p.paymentMethod}</td>
                            <td style={{ fontWeight: 700, color: "#10b981" }}>
                              {formatMoney(p.amount)}
                            </td>
                            <td>{p.createdByName || "—"}</td>
                            <td>{p.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Confirmación de Cancelación */}
              {showCancelPrompt ? (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid #ef4444",
                    borderRadius: 8,
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ef4444" }}>
                    <AlertCircle size={20} />
                    <strong>¿Deseas cancelar este apartado?</strong>
                  </div>
                  {detail.paidAmount > 0 && (
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.88rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={refundToBalance}
                        onChange={(e) => setRefundToBalance(e.target.checked)}
                      />
                      <span>
                        Reembolsar los <strong>{formatMoney(detail.paidAmount)}</strong> abonados como <strong>Saldo a Favor</strong> del cliente
                      </span>
                    </label>
                  )}
                  <input
                    placeholder="Motivo de cancelación (opcional)..."
                    value={cancelNotes}
                    onChange={(e) => setCancelNotes(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="inv-btn inv-btn--ghost"
                      onClick={() => setShowCancelPrompt(false)}
                      disabled={cancelling}
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      className="inv-btn"
                      style={{ background: "#ef4444", color: "#fff" }}
                      onClick={handleCancelLayaway}
                      disabled={cancelling}
                    >
                      {cancelling ? "Cancelando..." : "Confirmar Cancelación"}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Acciones */}
              <div className="inv-modal__actions" style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
                <div>
                  {detail.status === "active" && !showCancelPrompt && (
                    <button
                      type="button"
                      className="inv-btn inv-btn--ghost"
                      style={{ color: "#ef4444" }}
                      onClick={() => setShowCancelPrompt(true)}
                    >
                      <Ban size={15} style={{ marginRight: 4 }} />
                      Cancelar Apartado
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
                    Cerrar
                  </button>
                  {detail.status === "active" && (
                    <button
                      type="button"
                      className="inv-btn inv-btn--primary"
                      onClick={() => {
                        onAbonar(detail);
                      }}
                    >
                      <Wallet size={16} style={{ marginRight: 4 }} />
                      Abonar a este apartado
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
