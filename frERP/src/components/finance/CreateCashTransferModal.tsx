import { useState, useEffect } from "react";
import { createCashTransfer, uploadClosureReceiptFiles } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { ArrowLeftRight, X, AlertCircle, Check, Loader2 } from "lucide-react";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

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
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinationOptions = warehouses.filter(
    (w) => w.is_active && w.id !== originWarehouseId
  );

  // REGLA GENERAL: desde sedes físicas solo efectivo; traslado bancario solo desde la Sede Administrativa
  const isMainOrigin = isAllWarehouses;

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
      setReceiptFiles([]);
      setError(null);
    }
  }, [open, warehouseId, warehouses]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

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
          console.error("Error al subir comprobantes de traslado:", uploadErr);
          setError("No se pudieron subir las fotos del soporte. Por favor reintenta.");
          setSubmitting(false);
          return;
        }
      }

      await createCashTransfer(token, {
        originWarehouseId,
        destinationWarehouseId,
        amount,
        carrierName: carrierName.trim(),
        carrierDoc: carrierDoc.trim() || null,
        concept: concept.trim(),
        paymentMethod,
        senderReceiptUrl: uploadedReceiptUrl,
        senderReceiptUrls: uploadedReceiptUrls,
        senderReceiptFilename: uploadedReceiptFilename,
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
    <div
      className="inv-modal-backdrop"
      role="presentation"
      onClick={() => !submitting && onClose()}
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
        aria-labelledby="create-transfer-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
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
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(99, 102, 241, 0.1)",
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ArrowLeftRight size={22} />
            </div>
            <div>
              <h2
                id="create-transfer-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                Traslado de Dinero entre Sedes
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                Envía dinero en tránsito a otra sede con acuse de recibo
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inv-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
            padding: "22px 24px",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {error && <div className="inv-form-error">{error}</div>}

          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.22)",
              borderRadius: 10,
              fontSize: "0.84rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              color: "#4338ca",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>
              Al confirmar, el dinero quedará <strong>en tránsito</strong> y se notificará a la sede de destino. Una vez recibido allí, ingresará a su caja de efectivo.
            </span>
          </div>

          {/* Sedes Origen y Destino */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Sede de Origen (Emisora) *
              </span>
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
                  style={{ width: "100%" }}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(15, 23, 42, 0.12)",
                    background: "#f8fafc",
                    fontWeight: 600,
                    fontSize: "0.92rem",
                    color: "#0f172a",
                  }}
                >
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
                </div>
              )}
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Sede de Destino (Receptora) *
              </span>
              <select
                value={destinationWarehouseId}
                onChange={(e) => setDestinationWarehouseId(e.target.value)}
                required
                style={{ width: "100%" }}
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
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Valor a trasladar *
              </span>
              <input
                type="number"
                min="1"
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="$ 0"
                required
              />
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Medio de envío *
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="efectivo">Efectivo 💵</option>
                {isMainOrigin && <option value="bancolombia">Bancolombia 🟡</option>}
                {isMainOrigin && <option value="davivienda">Davivienda 🔴</option>}
              </select>
            </label>
          </div>

          {/* Transportador / Mensajero */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Persona / Mensajero que transporta *
              </span>
              <input
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="Ej: David Ruiz / Mensajería"
                required
              />
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Cédula del transportador
              </span>
              <input
                value={carrierDoc}
                onChange={(e) => setCarrierDoc(e.target.value)}
                placeholder="12345678"
              />
            </label>
          </div>

          <label className="field">
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Concepto / Motivo del traslado *
            </span>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej: Remesa de ventas del fin de semana para consignación"
              required
            />
          </label>

          <ReceiptPhotosUploader
            files={receiptFiles}
            onChange={setReceiptFiles}
            disabled={submitting}
            label="Fotos / Soporte del Envío (Recibo, comprobante o guía)"
            helperText="Puedes tomar fotos con la cámara o seleccionar archivos para dejar registro del dinero despachado."
          />

          {/* Modal Footer Actions */}
          <div
            style={{
              paddingTop: "0.5rem",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              onClick={onClose}
              disabled={submitting}
              style={{
                borderRadius: 10,
                padding: "9px 18px",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={submitting}
              style={{
                borderRadius: 10,
                padding: "9px 22px",
                fontWeight: 600,
                fontSize: "0.9rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                borderColor: "#4338ca",
                color: "#ffffff",
                boxShadow: "0 2px 8px rgba(79, 70, 229, 0.28)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Registrar Traslado de Dinero</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
