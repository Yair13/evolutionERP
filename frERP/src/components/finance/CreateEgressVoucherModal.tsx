import { useState, useEffect } from "react";
import { createCashOutflow, fetchSuppliers, uploadClosureReceiptFiles, type CashOutflowItem, type SupplierItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { FileMinus, X, Building2, AlertCircle, Check, Loader2 } from "lucide-react";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (outflow: CashOutflowItem) => void;
};

const BANK_PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo 💵" },
  { value: "bancolombia", label: "Bancolombia 🟡" },
  { value: "davivienda", label: "Davivienda 🔴" },
  { value: "nequi", label: "Nequi 🟣" },
  { value: "daviplata", label: "Daviplata 🔴" },
  { value: "bold", label: "Bold 🔵" },
] as const;

export function CreateEgressVoucherModal({ open, onClose, onSuccess }: Props) {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || ""));
    }
  }, [open, isAllWarehouses, warehouseId, warehouses]);
  const [concept, setConcept] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryDoc, setBeneficiaryDoc] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [referenceCode, setReferenceCode] = useState("");
  const [notes, setNotes] = useState("");

  // Proveedores opcionales
  const [supplierList, setSupplierList] = useState<SupplierItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");

  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determinar si la sede seleccionada es la Bodega Principal
  const currentWh = warehouses.find((w) => w.id === selectedWarehouseId);
  const isMainWarehouse =
    Boolean(currentWh?.is_factory) ||
    currentWh?.code === "MAIN" ||
    (currentWh?.name || "").toLowerCase().includes("principal");

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(warehouseId || (warehouses[0]?.id ?? ""));
      setConcept("");
      setBeneficiaryName("");
      setBeneficiaryDoc("");
      setAmountStr("");
      setPaymentMethod("efectivo");
      setReferenceCode("");
      setNotes("");
      setSelectedSupplierId("");
      setReceiptFiles([]);
      setError(null);
    }
  }, [open, warehouseId, warehouses]);

  // Si cambia a una sede que no es la principal, forzar a efectivo
  useEffect(() => {
    if (!isMainWarehouse && paymentMethod !== "efectivo") {
      setPaymentMethod("efectivo");
    }
  }, [isMainWarehouse, paymentMethod]);

  // Cargar lista de proveedores para autocompletar si lo desean
  useEffect(() => {
    if (!open || !token) return;
    fetchSuppliers(token, { activeOnly: true, limit: 100 })
      .then((res) => setSupplierList(res.items || []))
      .catch((err) => console.error("Error al cargar proveedores:", err));
  }, [open, token]);

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

    if (!selectedWarehouseId) {
      setError("Selecciona la sede de donde sale el dinero.");
      return;
    }

    if (!concept.trim()) {
      setError("Indica el concepto o motivo del egreso.");
      return;
    }

    if (!beneficiaryName.trim()) {
      setError("Indica el nombre de la persona que recibe el dinero.");
      return;
    }

    const amount = Number(amountStr) || 0;
    if (amount <= 0) {
      setError("El valor del egreso debe ser mayor a $0.");
      return;
    }

    if (!isMainWarehouse && paymentMethod !== "efectivo") {
      setError("En esta sede solo se permite la salida de dinero en Efectivo.");
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
          console.error("Error al subir comprobantes de egreso:", uploadErr);
          setError("No se pudieron subir las fotos del soporte. Por favor reintenta.");
          setSubmitting(false);
          return;
        }
      }

      const res = await createCashOutflow(token, {
        warehouseId: selectedWarehouseId,
        concept: concept.trim(),
        beneficiaryName: beneficiaryName.trim(),
        beneficiaryDoc: beneficiaryDoc.trim() || null,
        amount,
        paymentMethod,
        supplierId: selectedSupplierId || null,
        referenceCode: referenceCode.trim() || null,
        notes: notes.trim() || null,
        receiptUrl: uploadedReceiptUrl,
        receiptUrls: uploadedReceiptUrls,
        receiptFilename: uploadedReceiptFilename,
      });

      onSuccess(res.item);
      onClose();
    } catch (err: any) {
      if (err.message === "bank_account_restricted_to_main_warehouse") {
        setError("Las salidas bancarias solo están permitidas desde la Bodega Principal.");
      } else {
        setError(err instanceof Error ? err.message : "Error al registrar el egreso.");
      }
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
        aria-labelledby="create-egress-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
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
                background: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FileMinus size={22} />
            </div>
            <div>
              <h2
                id="create-egress-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                Comprobante de Egreso
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                Registra salidas de dinero en efectivo o transferencias bancarias
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

          {/* Sede de origen del dinero */}
          <label className="field">
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Sede de donde sale el dinero *
            </span>
            {isAllWarehouses ? (
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={submitting}
                required
                style={{ width: "100%" }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code}) {w.is_factory ? "— Fábrica / Bodega Principal" : ""}
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

          {/* Advertencia / Regla de salida bancaria */}
          {!isMainWarehouse ? (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.28)",
                borderRadius: 10,
                fontSize: "0.84rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                color: "#b45309",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>
                <strong>Sede Operativa:</strong> Las salidas de dinero se realizan exclusivamente en <strong>Efectivo</strong> de caja menor. Las transferencias por banco se autorizan desde la Bodega Principal.
              </span>
            </div>
          ) : (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.24)",
                borderRadius: 10,
                fontSize: "0.84rem",
                color: "#4338ca",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
              }}
            >
              <span style={{ fontSize: "1.15rem", flexShrink: 0 }}>🏢</span>
              <span>
                <strong>Bodega Principal (Secretaría):</strong> Autorizada para egresos en efectivo y giros bancarios directos.
              </span>
            </div>
          )}

          {/* Beneficiario / Quien recibe */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Persona a quien se entrega el dinero (Beneficiario) *
              </span>
              <input
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Ej: Pedro Martínez / Mensajero"
                required
              />
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Cédula / Documento
              </span>
              <input
                value={beneficiaryDoc}
                onChange={(e) => setBeneficiaryDoc(e.target.value)}
                placeholder="12345678"
              />
            </label>
          </div>

          {/* Concepto y Monto */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Concepto / Motivo de la salida *
              </span>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej: Compra de insumos de aseo / Viáticos"
                required
              />
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Valor Salida *
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
          </div>

          {/* Medio de pago y referencia */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Medio de Pago / Cuenta *
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={!isMainWarehouse}
              >
                {isMainWarehouse ? (
                  BANK_PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))
                ) : (
                  <option value="efectivo">Efectivo 💵 (Caja Menor)</option>
                )}
              </select>
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                N° Comprobante / Ref
              </span>
              <input
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="N° transferencia / recibo"
              />
            </label>
          </div>

          {/* Asociar a proveedor si aplica */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              padding: "0.85rem 1rem",
              borderRadius: 12,
            }}
          >
            <label className="field" style={{ margin: 0 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  color: "#334155",
                }}
              >
                <Building2 size={16} color="#4f46e5" />
                Asociar a Proveedor (Opcional)
              </span>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                style={{ marginTop: 4, width: "100%" }}
              >
                <option value="">-- Ninguno / Gasto general o personal --</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.taxId ? `(NIT: ${s.taxId})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ReceiptPhotosUploader
            files={receiptFiles}
            onChange={setReceiptFiles}
            disabled={submitting}
            label="Fotos / Soporte del Egreso (Factura, recibo, transferencia)"
            helperText="Puedes tomar fotos con la cámara o subir archivos (imágenes o PDF) del soporte de la salida de dinero."
          />

          <label className="field">
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Notas u Observaciones
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles adicionales del egreso..."
              style={{ resize: "vertical", minHeight: 60 }}
            />
          </label>

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
                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                borderColor: "#047857",
                color: "#ffffff",
                boxShadow: "0 2px 8px rgba(5, 150, 105, 0.28)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Emitir Comprobante de Egreso</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
