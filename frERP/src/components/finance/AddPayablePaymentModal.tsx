import { useState } from "react";
import { addPayablePayment, uploadClosureReceiptFiles, type PayableSummaryItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { Wallet, X, CheckCircle2, CreditCard } from "lucide-react";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

type Props = {
  open: boolean;
  payable: PayableSummaryItem | null;
  supplierCreditBalance?: number;
  supplierBankInfo?: {
    bankName: string | null;
    accountType: string | null;
    accountNumber: string | null;
  };
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
  { value: "saldo_a_favor", label: "Usar Saldo a Favor con Proveedor 💰" },
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

export function AddPayablePaymentModal({
  open,
  payable,
  supplierCreditBalance = 0,
  supplierBankInfo,
  onClose,
  onSuccess,
}: Props) {
  const { token } = useAuth();
  const { warehouseId, isAllWarehouses } = useWarehouse();
  const targetWh = warehouseId || payable?.warehouseId;

  const [amountStr, setAmountStr] = useState<string>("");
  const [method, setMethod] = useState<string>("efectivo");
  const [referenceCode, setReferenceCode] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptResult, setReceiptResult] = useState<any | null>(null);

  if (!open || !payable) return null;

  const rawParsed = Number(String(amountStr).replace(",", "."));
  const amount = Number.isFinite(rawParsed) ? Math.round(rawParsed * 100) / 100 : 0;
  const currentBalance = Math.round((Number(payable.balanceAmount) || 0) * 100) / 100;
  const excess = Math.max(0, Math.round((amount - currentBalance) * 100) / 100);
  const remainingDebt = Math.max(0, Math.round((currentBalance - amount) * 100) / 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !targetWh || !payable) return;

    if (amount <= 0) {
      setError("Indica un valor a abonar mayor a $0.");
      return;
    }

    if (method === "saldo_a_favor" && amount > supplierCreditBalance) {
      setError(`Solo cuentas con ${formatMoney(supplierCreditBalance)} de saldo a favor con este proveedor.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedReceiptUrl: string | null = null;
      let uploadedReceiptUrls: string[] = [];
      let uploadedReceiptFilename: string | null = null;

      if (receiptFiles.length > 0) {
        try {
          const uploads = await uploadClosureReceiptFiles(token, receiptFiles);
          uploadedReceiptUrls = uploads.map((u) => u.url);
          uploadedReceiptUrl = uploadedReceiptUrls[0] || null;
          uploadedReceiptFilename = uploads[0]?.filename || null;
        } catch (uploadErr) {
          console.error("Error al subir comprobantes:", uploadErr);
          setError("No se pudieron subir las fotos del soporte. Por favor reintenta.");
          setSubmitting(false);
          return;
        }
      }

      const res = await addPayablePayment(token, payable.id, {
        warehouseId: targetWh,
        paymentMethod: method,
        amount,
        referenceCode: referenceCode.trim() || null,
        notes: notes.trim() || null,
        receiptUrl: uploadedReceiptUrl,
        receiptUrls: uploadedReceiptUrls,
        receiptFilename: uploadedReceiptFilename,
      });

      setReceiptResult(res);
      onSuccess(res);
    } catch (err: any) {
      if (err.message === "insufficient_credit_balance") {
        setError("El saldo a favor con el proveedor es insuficiente.");
      } else {
        setError(err instanceof Error ? err.message : "Error al registrar el pago.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setReceiptResult(null);
    setAmountStr("");
    setReferenceCode("");
    setNotes("");
    setReceiptFiles([]);
    setError(null);
    onClose();
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && handleClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="add-payable-payment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Wallet size={20} color="#10b981" />
            <h2 id="add-payable-payment-title" className="inv-modal__title">
              Registrar Egreso / Pago a Proveedor
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
              ¡Comprobante de Egreso Generado!
            </h3>
            <p style={{ color: "var(--inv-text-muted)", margin: "0 0 1.25rem" }}>
              N° Comprobante: <strong>{receiptResult.payment.receiptNumber}</strong>
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
                <span>Proveedor:</span>
                <strong>{payable.supplierName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Factura / Cuenta:</span>
                <strong>{payable.billNumber || "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Total Desembolsado:</span>
                <strong style={{ color: "#10b981" }}>{formatMoney(receiptResult.payment.amount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Aplicado a Deuda:</span>
                <strong>{formatMoney(receiptResult.appliedToDebt)}</strong>
              </div>
              {receiptResult.excessToFavour > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#818cf8", fontWeight: 600 }}>
                  <span>Excedente a Saldo a Favor:</span>
                  <span>+{formatMoney(receiptResult.excessToFavour)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Saldo Restante de la Factura:</span>
                <strong style={{ color: receiptResult.newBalanceAmount === 0 ? "#10b981" : "#f59e0b" }}>
                  {formatMoney(receiptResult.newBalanceAmount)}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Nuevo Saldo a Favor con Proveedor:</span>
                <strong style={{ color: "#10b981" }}>{formatMoney(receiptResult.supplierCreditBalance)}</strong>
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

            {/* Resumen de la deuda */}
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
                <span style={{ color: "var(--inv-text-muted)" }}>Proveedor:</span>
                <strong>{payable.supplierName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Factura / Remisión:</span>
                <strong>{payable.billNumber || "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Concepto:</span>
                <span>{payable.description || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Total Factura:</span>
                <strong>{formatMoney(payable.totalAmount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--inv-text-muted)" }}>Saldo Pendiente por Pagar:</span>
                <strong style={{ color: "#f59e0b", fontSize: "1rem" }}>{formatMoney(currentBalance)}</strong>
              </div>
              {supplierCreditBalance > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontWeight: 600 }}>
                  <span>Saldo a favor con proveedor:</span>
                  <span>{formatMoney(supplierCreditBalance)}</span>
                </div>
              )}
            </div>

            {/* Datos bancarios del proveedor para transferencia rápida */}
            {supplierBankInfo && supplierBankInfo.bankName && (
              <div
                style={{
                  padding: "0.6rem 0.8rem",
                  background: "rgba(99, 102, 241, 0.05)",
                  border: "1px dashed rgba(99, 102, 241, 0.3)",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <CreditCard size={18} color="#818cf8" />
                <div>
                  <strong>{supplierBankInfo.bankName}</strong> · Cta {supplierBankInfo.accountType}: <strong>{supplierBankInfo.accountNumber}</strong>
                </div>
              </div>
            )}

            <label className="field">
              <span>Valor a pagar / desembolsar *</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="Ej: 500000 o 500000.50"
                  required
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  onClick={() => setAmountStr(String(currentBalance))}
                  style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}
                >
                  Pagar total
                </button>
              </div>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "0.75rem" }}>
              <label className="field">
                <span>Medio de pago *</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.filter(
                    (m) => isAllWarehouses || m.value === "efectivo" || m.value === "saldo_a_favor"
                  ).map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {!isAllWarehouses && (
                  <small style={{ color: "#b45309", fontSize: "0.74rem" }}>
                    Sede física: solo pagos en efectivo. Pagos por cuentas desde la Sede Administrativa.
                  </small>
                )}
              </label>

              <label className="field">
                <span>N° Comprobante / Ref</span>
                <input
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  placeholder="Ej: Transf. 987654"
                />
              </label>
            </div>

            {amount > 0 && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.05)",
                  border: "1px dashed rgba(16, 185, 129, 0.3)",
                  padding: "0.75rem",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span>Abono a la deuda:</span>
                  <strong>{formatMoney(Math.min(amount, currentBalance))}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Nuevo saldo pendiente:</span>
                  <strong style={{ color: remainingDebt === 0 ? "#10b981" : "#f59e0b" }}>
                    {formatMoney(remainingDebt)}
                  </strong>
                </div>
                {excess > 0 && method !== "saldo_a_favor" && (
                  <div style={{ marginTop: "0.4rem", color: "#818cf8", fontWeight: 600 }}>
                    ℹ️ ¡Abonaste de más por {formatMoney(excess)}! Este valor quedará registrado como Saldo a Favor de la empresa para la próxima compra con este proveedor.
                  </div>
                )}
              </div>
            )}

            {method !== "saldo_a_favor" && (
              <ReceiptPhotosUploader
                files={receiptFiles}
                onChange={setReceiptFiles}
                disabled={submitting}
                label="Fotos / Soporte del Pago (Transferencia / Comprobante)"
                helperText="Toma foto con la cámara o adjunta comprobantes para auditar el pago bancario."
              />
            )}

            <label className="field">
              <span>Notas / Observaciones</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observación del pago..."
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
                {submitting ? "Generando Egreso..." : "Confirmar Salida de Dinero"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
