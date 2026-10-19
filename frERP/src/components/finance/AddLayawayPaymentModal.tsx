import { useState } from "react";
import { addLayawayPayment, type LayawaySummaryItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { Wallet, X, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  layaway: LayawaySummaryItem | null;
  customerCreditBalance?: number;
  onClose: () => void;
  onSuccess: (updatedData: any) => void;
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
  { value: "saldo_a_favor", label: "Usar Saldo a Favor 💰" },
] as const;

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function AddLayawayPaymentModal({
  open,
  layaway,
  customerCreditBalance = 0,
  onClose,
  onSuccess,
}: Props) {
  const { token } = useAuth();
  const { warehouseId } = useWarehouse();
  const targetWh = warehouseId || layaway?.warehouseId;

  const [amountStr, setAmountStr] = useState<string>("");
  const [method, setMethod] = useState<string>("efectivo");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptResult, setReceiptResult] = useState<any | null>(null);

  if (!open || !layaway) return null;

  const amount = Number(amountStr) || 0;
  const currentPaid = layaway.paidAmount;
  const currentRemaining = layaway.remainingAmount;
  const newPaid = currentPaid + amount;
  const newRemaining = Math.max(0, currentRemaining - amount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !targetWh || !layaway) return;

    if (amount <= 0) {
      setError("Indica un valor a abonar mayor a $0.");
      return;
    }

    if (method === "saldo_a_favor" && amount > customerCreditBalance) {
      setError(`El cliente solo cuenta con ${formatMoney(customerCreditBalance)} de saldo a favor.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await addLayawayPayment(token, layaway.id, {
        warehouseId: targetWh,
        paymentMethod: method,
        amount,
        notes: notes.trim() || null,
      });

      setReceiptResult(res);
      onSuccess(res);
    } catch (err: any) {
      if (err.message === "insufficient_credit_balance") {
        setError("El cliente no tiene suficiente saldo a favor.");
      } else {
        setError(err instanceof Error ? err.message : "Error al registrar el abono.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setReceiptResult(null);
    setAmountStr("");
    setNotes("");
    setError(null);
    onClose();
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && handleClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="add-layaway-payment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Wallet size={20} color="#10b981" />
            <h2 id="add-layaway-payment-title" className="inv-modal__title">
              Registrar Abono a Apartado
            </h2>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={handleClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {receiptResult ? (
          <div className="inv-modal__body" style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
            <CheckCircle2 size={48} color="#10b981" style={{ margin: "0 auto 1rem" }} />
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              ¡Abono Registrado con Éxito!
            </h3>
            <p style={{ color: "var(--inv-text-muted)", margin: "0 0 1.25rem" }}>
              Comprobante de Abono: <strong>{receiptResult.payment.receiptNumber}</strong>
            </p>

            <div
              style={{
                background: "var(--inv-bg-elevated)",
                padding: "1rem",
                borderRadius: 8,
                textAlign: "left",
                marginBottom: "1.5rem",
                fontSize: "0.9rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Apartado:</span>
                <strong>{layaway.code}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Cliente:</span>
                <strong>{layaway.customerName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Monto Abonado:</span>
                <strong style={{ color: "#10b981" }}>{formatMoney(receiptResult.payment.amount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Medio de Pago:</span>
                <strong style={{ textTransform: "capitalize" }}>{receiptResult.payment.paymentMethod}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Total Acumulado:</span>
                <strong>{formatMoney(receiptResult.newPaidAmount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Saldo Pendiente:</span>
                <strong style={{ color: "#f59e0b" }}>{formatMoney(receiptResult.newRemainingAmount)}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                type="button"
                className="inv-btn inv-btn--primary"
                onClick={handleClose}
              >
                Aceptar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="inv-modal__body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {error && <div className="inv-form-error">{error}</div>}

            {/* Resumen del apartado */}
            <div
              style={{
                background: "var(--inv-bg-elevated)",
                padding: "0.75rem 1rem",
                borderRadius: 8,
                fontSize: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Apartado:</span>
                <strong>{layaway.code}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Cliente:</span>
                <strong>{layaway.customerName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Total Meta:</span>
                <strong>{formatMoney(layaway.targetAmount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Abonado hasta hoy:</span>
                <strong style={{ color: "#10b981" }}>{formatMoney(currentPaid)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Saldo por pagar:</span>
                <strong style={{ color: "#f59e0b" }}>{formatMoney(currentRemaining)}</strong>
              </div>
              {customerCreditBalance > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontWeight: 600 }}>
                  <span>Saldo a favor disponible:</span>
                  <span>{formatMoney(customerCreditBalance)}</span>
                </div>
              )}
            </div>

            <label className="field">
              <span>Valor a abonar *</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="Ej: 50000"
                  required
                  autoFocus
                  style={{ flex: 1 }}
                />
                {currentRemaining > 0 && (
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    onClick={() => setAmountStr(String(currentRemaining))}
                    style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}
                  >
                    Pagar saldo restante
                  </button>
                )}
              </div>
            </label>

            <label className="field">
              <span>Método de pago *</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {amount > 0 && (
              <div
                style={{
                  background: "rgba(99, 102, 241, 0.05)",
                  border: "1px dashed rgba(99, 102, 241, 0.3)",
                  padding: "0.75rem",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span>Nuevo total abonado:</span>
                  <strong style={{ color: "#10b981" }}>{formatMoney(newPaid)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Nuevo saldo pendiente:</span>
                  <strong style={{ color: newRemaining === 0 ? "#10b981" : "#f59e0b" }}>
                    {formatMoney(newRemaining)}
                  </strong>
                </div>
                {amount > currentRemaining && (
                  <div style={{ marginTop: "0.4rem", color: "#818cf8", fontWeight: 600 }}>
                    ℹ️ El abono supera la meta. Al facturar en POS, el exceso pasará automáticamente a Saldo a Favor.
                  </div>
                )}
              </div>
            )}

            <label className="field">
              <span>Notas / Observación (opcional)</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Abono quincena..."
              />
            </label>

            <div className="inv-modal__actions" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inv-btn inv-btn--primary"
                disabled={submitting}
              >
                {submitting ? "Registrando..." : "Confirmar Abono"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
