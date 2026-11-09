import { useState } from "react";
import { updateReceivablePayment, type ReceivablePaymentItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { Edit3, X, AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  payment: ReceivablePaymentItem | null;
  onClose: () => void;
  onSuccess: (updatedPayment: any) => void;
};

const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo 💵" },
  { value: "bancolombia", label: "Bancolombia 🟡" },
  { value: "davivienda", label: "Davivienda 🔴" },
  { value: "nequi", label: "Nequi 🟣" },
  { value: "daviplata", label: "Daviplata 🔴" },
  { value: "bold", label: "Bold 🔵" },
  { value: "addi", label: "Addi 🟢" },
  { value: "sistecredito", label: "Sistecrédito" },
  { value: "saldo_a_favor", label: "Saldo a Favor 💰" },
  { value: "otro", label: "Otro / Transferencia" },
] as const;

function formatMoney(n: number): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
}

export function EditPaymentModal({ open, payment, onClose, onSuccess }: Props) {
  const { token } = useAuth();

  const [amountStr, setAmountStr] = useState<string>(payment ? String(payment.amount) : "");
  const [method, setMethod] = useState<string>(payment ? payment.paymentMethod : "efectivo");
  const [notes, setNotes] = useState<string>(payment?.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !payment) return null;

  const rawParsed = Number(String(amountStr).replace(",", "."));
  const amount = Number.isFinite(rawParsed) ? Math.round(rawParsed * 100) / 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !payment) return;

    if (amount <= 0) {
      setError("El valor a abonar debe ser mayor a $0.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await updateReceivablePayment(token, payment.id, {
        amount,
        paymentMethod: method,
        notes: notes.trim() || null,
      });
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error al actualizar el abono.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal inv-modal--checkout"
        style={{ maxWidth: 500 }}
        role="dialog"
        aria-labelledby="edit-payment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 id="edit-payment-title" style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Edit3 size={20} className="text-primary" />
            Editar Abono de Cartera
          </h2>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            style={{ padding: 4 }}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Resumen del recibo actual */}
        <div style={{
          background: "var(--bg-card-subtle, rgba(255,255,255,0.04))",
          border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
          borderRadius: 8,
          padding: "0.85rem",
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
            <span style={{ color: "var(--text-muted)" }}>Recibo de Caja:</span>
            <strong>{payment.receiptNumber}</strong>
          </div>
          {payment.invoiceNumber && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Factura de Referencia:</span>
              <span>{payment.invoiceNumber}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Valor Original:</span>
            <span style={{ color: "#64748b", textDecoration: amount !== payment.amount ? "line-through" : "none" }}>
              {formatMoney(payment.amount)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Nuevo Valor *</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                required
                autoFocus
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setError(null);
                }}
                placeholder="Ej. 8000000"
              />
            </label>

            <label className="field">
              <span>Medio de Pago *</span>
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setError(null);
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Notas / Observación</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo del cambio, referencia de transferencia, etc."
            />
          </label>

          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            padding: "0.65rem 0.85rem",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: 6,
            fontSize: "0.82rem",
            color: "#d97706",
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              Al guardar, se recalculará automáticamente la amortización de las facturas del cliente y el saldo a favor según el nuevo valor y medio de pago.
            </div>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="inv-modal__actions inv-modal__actions--spaced" style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              disabled={submitting}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={submitting || amount <= 0}
            >
              {submitting ? "Guardando…" : `Guardar Cambios (${formatMoney(amount)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
