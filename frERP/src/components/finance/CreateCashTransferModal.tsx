import { useState, useEffect } from "react";
import { createCashTransfer } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { ArrowLeftRight, X, AlertCircle } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function CreateCashTransferModal({ open, onClose, onSuccess }: Props) {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [originWarehouseId, setOriginWarehouseId] = useState<string>(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [carrierName, setCarrierName] = useState<string>("");
  const [carrierDoc, setCarrierDoc] = useState<string>("");
  const [concept, setConcept] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinationOptions = warehouses.filter(
    (w) => w.is_active && w.id !== originWarehouseId
  );

  const originWh = warehouses.find((w) => w.id === originWarehouseId);
  const isMainOrigin =
    Boolean(originWh?.is_factory) ||
    originWh?.code === "MAIN" ||
    (originWh?.name || "").toLowerCase().includes("principal");

  useEffect(() => {
    if (open) {
      const orig = warehouseId || (warehouses[0]?.id ?? "");
      setOriginWarehouseId(orig);
      const firstDest = warehouses.find((w) => w.is_active && w.id !== orig)?.id ?? "";
      setDestinationWarehouseId(firstDest);
      setAmountStr("");
      setCarrierName("");
      setCarrierDoc("");
      setConcept("");
      setPaymentMethod("efectivo");
      setError(null);
    }
  }, [open, warehouseId, warehouses]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!originWarehouseId) {
      setError("Selecciona la sede de origen.");
      return;
    }

    if (!destinationWarehouseId) {
      setError("Selecciona la sede de destino del dinero.");
      return;
    }

    if (originWarehouseId === destinationWarehouseId) {
      setError("La sede de destino no puede ser la misma de origen.");
      return;
    }

    const amount = Number(amountStr) || 0;
    if (amount <= 0) {
      setError("Indica un valor a trasladar mayor a $0.");
      return;
    }

    if (!carrierName.trim()) {
      setError("Indica el nombre de la persona o mensajero que transportará el dinero.");
      return;
    }

    if (!concept.trim()) {
      setError("Indica el concepto o motivo del traslado.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createCashTransfer(token, {
        originWarehouseId,
        destinationWarehouseId,
        amount,
        carrierName: carrierName.trim(),
        carrierDoc: carrierDoc.trim() || null,
        concept: concept.trim(),
        paymentMethod,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Error al registrar el traslado de dinero.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="create-transfer-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580 }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ArrowLeftRight size={20} color="#6366f1" />
            <h2 id="create-transfer-title" className="inv-modal__title">
              Traslado de Dinero entre Sedes
            </h2>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="inv-modal__body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error && <div className="inv-form-error">{error}</div>}

          <div
            style={{
              padding: "0.6rem 0.8rem",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: 6,
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "#818cf8",
            }}
          >
            <AlertCircle size={18} />
            <span>
              Al confirmar, el dinero quedará <strong>en tránsito</strong> y se notificará de inmediato a la sede de destino. Apenas el receptor confirme en su pantalla, el dinero se depositará en su caja de efectivo.
            </span>
          </div>

          {/* Sedes Origen y Destino */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Sede de Origen (Emisora) *</span>
              {isAllWarehouses ? (
                <select
                  value={originWarehouseId}
                  onChange={(e) => {
                    setOriginWarehouseId(e.target.value);
                    const firstDest = warehouses.find((w) => w.is_active && w.id !== e.target.value)?.id ?? "";
                    setDestinationWarehouseId(firstDest);
                  }}
                  disabled={submitting}
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-elevated)", fontWeight: 600, fontSize: "0.9rem" }}>
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
                </div>
              )}
            </label>

            <label className="field">
              <span>Sede de Destino (Receptora) *</span>
              <select
                value={destinationWarehouseId}
                onChange={(e) => setDestinationWarehouseId(e.target.value)}
                required
              >
                <option value="">-- Selecciona sede receptora --</option>
                {destinationOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Monto y Medio */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Valor a trasladar *</span>
              <input
                type="number"
                min="1"
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="$ 0"
                required
                autoFocus
              />
            </label>

            <label className="field">
              <span>Medio de envío *</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="efectivo">Efectivo 💵</option>
                {isMainOrigin && <option value="bancolombia">Bancolombia 🟡</option>}
                {isMainOrigin && <option value="davivienda">Davivienda 🔴</option>}
              </select>
            </label>
          </div>

          {/* Transportador / Mensajero */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Persona / Mensajero que transporta *</span>
              <input
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="Ej: David Ruiz / Mensajería"
                required
              />
            </label>

            <label className="field">
              <span>Cédula del transportador</span>
              <input
                value={carrierDoc}
                onChange={(e) => setCarrierDoc(e.target.value)}
                placeholder="12345678"
              />
            </label>
          </div>

          <label className="field">
            <span>Concepto / Motivo del traslado *</span>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej: Remesa de ventas del fin de semana para consignación"
              required
            />
          </label>

          <div className="inv-modal__actions" style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={submitting}
            >
              {submitting ? "Enviando..." : "Registrar Traslado de Dinero"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
