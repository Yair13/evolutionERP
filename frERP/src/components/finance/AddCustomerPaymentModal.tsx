import { useState } from "react";
import { addCustomerPortfolioPayment, uploadClosureReceiptFiles, type ReceivableSummaryItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { UserCheck, X } from "lucide-react";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

type Props = {
  open: boolean;
  customerId: string;
  customerName: string;
  customerCreditBalance?: number;
  pendingReceivables: ReceivableSummaryItem[];
  defaultWarehouseId?: string;
  onClose: () => void;
  onSuccess: (result: any) => void;
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

export function AddCustomerPaymentModal({
  open,
  customerId,
  customerName,
  customerCreditBalance = 0,
  pendingReceivables,
  defaultWarehouseId,
  onClose,
  onSuccess,
}: Props) {
  const { token } = useAuth();
  const { warehouseId } = useWarehouse();
  const targetWh = defaultWarehouseId || warehouseId;

  const [amountStr, setAmountStr] = useState<string>("");
  const [method, setMethod] = useState<string>("efectivo");
  const [notes, setNotes] = useState<string>("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const rawParsed = Number(String(amountStr).replace(",", "."));
  const amount = Number.isFinite(rawParsed) ? Math.round(rawParsed * 100) / 100 : 0;

  const totalDebt = pendingReceivables.reduce((sum, r) => sum + (Number(r.balanceAmount) || 0), 0);
  const excess = Math.max(0, Math.round((amount - totalDebt) * 100) / 100);
  const remainingTotalDebt = Math.max(0, Math.round((totalDebt - amount) * 100) / 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !targetWh || !customerId) return;

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
      let uploadedUrl: string | null = null;
      let uploadedUrls: string[] = [];
      let uploadedFilename: string | null = null;

      if (receiptFiles.length > 0 && token) {
        const upRes = await uploadClosureReceiptFiles(token, receiptFiles);
        if (upRes.length > 0) {
          uploadedUrl = upRes[0]?.publicUrl || null;
          uploadedFilename = upRes[0]?.filename || null;
          uploadedUrls = upRes.map((u) => u.publicUrl);
        }
      }

      const res = await addCustomerPortfolioPayment(token, {
        customerId,
        warehouseId: targetWh,
        paymentMethod: method,
        amount,
        notes: notes.trim() || undefined,
        receiptUrl: uploadedUrl,
        receiptUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        receiptFilename: uploadedFilename,
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error al registrar el abono al cliente");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal inv-modal--checkout"
        style={{ maxWidth: 560 }}
        role="dialog"
        aria-labelledby="customer-payment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 id="customer-payment-title" style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <UserCheck size={22} className="text-primary" />
            Abono a Cartera del Cliente
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

        {/* Resumen de Cliente y Deuda */}
        <div style={{
          background: "var(--bg-card-subtle, rgba(255,255,255,0.04))",
          border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
          borderRadius: 8,
          padding: "0.85rem",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Cliente:</span>
            <strong>{customerName}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Facturas Pendientes:</span>
            <span>{pendingReceivables.length} factura(s) a crédito</span>
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "0.5rem",
            borderTop: "1px dashed var(--border-color, rgba(255,255,255,0.1))",
            fontWeight: 700,
            fontSize: "1.05rem",
          }}>
            <span>Deuda Total Pendiente:</span>
            <span style={{ color: "#ef4444" }}>{formatMoney(totalDebt)}</span>
          </div>
        </div>

        {/* Saldo a favor si tiene */}
        {customerCreditBalance > 0 && (
          <div style={{
            padding: "0.5rem 0.75rem",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: 6,
            marginBottom: "1rem",
            fontSize: "0.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ color: "#10b981" }}>
              💰 Saldo a favor disponible: <strong>{formatMoney(customerCreditBalance)}</strong>
            </span>
            <button
              type="button"
              style={{
                background: "rgba(16, 185, 129, 0.2)",
                border: "1px solid #10b981",
                color: "#10b981",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
              onClick={() => {
                setMethod("saldo_a_favor");
                setAmountStr(String(Math.min(customerCreditBalance, totalDebt)));
              }}
            >
              Usar saldo a favor
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Monto a abonar *</span>
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
              <span>Método de pago *</span>
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setError(null);
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option
                    key={m.value}
                    value={m.value}
                    disabled={m.value === "saldo_a_favor" && customerCreditBalance <= 0}
                  >
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Botones de montos rápidos */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              style={{ fontSize: "0.75rem", padding: "3px 8px" }}
              onClick={() => setAmountStr(String(totalDebt))}
            >
              Saldar Deuda Total ({formatMoney(totalDebt)})
            </button>
            {totalDebt > 50000 && (
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                onClick={() => setAmountStr(String(Math.round(totalDebt / 2)))}
              >
                Abonar 50% ({formatMoney(Math.round(totalDebt / 2))})
              </button>
            )}
          </div>

          {/* Impacto del abono */}
          {amount > 0 && (
            <div style={{
              padding: "0.65rem 0.85rem",
              borderRadius: 6,
              fontSize: "0.85rem",
              background: remainingTotalDebt === 0 ? "rgba(16, 185, 129, 0.12)" : "rgba(99, 102, 241, 0.1)",
              border: `1px solid ${remainingTotalDebt === 0 ? "rgba(16, 185, 129, 0.35)" : "rgba(99, 102, 241, 0.3)"}`,
            }}>
              <div>
                Nueva deuda total del cliente:{" "}
                <strong style={{ color: remainingTotalDebt === 0 ? "#10b981" : "#ef4444" }}>
                  {remainingTotalDebt === 0 ? "¡Toda la cartera quedará al día! 🎉" : formatMoney(remainingTotalDebt)}
                </strong>
              </div>
              <div style={{ marginTop: "0.25rem", color: "#64748b", fontSize: "0.78rem" }}>
                El dinero se amortizará automáticamente en orden cronológico (de la factura más antigua a la más reciente).
              </div>
              {excess > 0 && (
                <div style={{ marginTop: "0.35rem", color: "#10b981", fontWeight: 600 }}>
                  ✨ ¡Paga más de lo adeudado! Excedente de <strong>{formatMoney(excess)}</strong> quedará como Saldo a Favor del cliente.
                </div>
              )}
            </div>
          )}

          {/* Soporte fotográfico si no es efectivo */}
          {method !== "efectivo" && method !== "saldo_a_favor" && (
            <ReceiptPhotosUploader
              files={receiptFiles}
              onChange={setReceiptFiles}
              disabled={submitting}
              label="Comprobantes / Fotos de Soporte (No Efectivo)"
              hint="Toma una foto del comprobante o adjunta capturas de transferencia."
            />
          )}

          <label className="field">
            <span>Notas / Observación</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Abono global entregado por el cliente..."
            />
          </label>

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
              {submitting ? "Registrando…" : `Confirmar Abono (${formatMoney(amount)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
