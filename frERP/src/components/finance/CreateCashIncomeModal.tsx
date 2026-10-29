import { useState, useEffect } from "react";
import {
  createCashIncome,
  uploadClosureReceiptFiles,
  type CashIncomeItem,
  type CashIncomeCategory,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";
import {
  PlusCircle,
  X,
  AlertCircle,
  Check,
  Loader2,
  Building2,
  User,
  CreditCard,
  FileText,
  DollarSign,
  Tag,
} from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (created: CashIncomeItem) => void;
};

const CATEGORIES: { id: CashIncomeCategory; label: string; desc: string; icon: string }[] = [
  {
    id: "driver_refund",
    label: "Devolución Conductor / Viáticos",
    desc: "Plata devuelta por conductores o transportadores",
    icon: "🚚",
  },
  {
    id: "scrap_sale",
    label: "Venta Cuero / Retal / Desecho",
    desc: "Venta de retales de cuero, subproductos o no inventario",
    icon: "📦",
  },
  {
    id: "operational_refund",
    label: "Reintegro Operativo",
    desc: "Reembolsos de gastos, devoluciones o garantías",
    icon: "🔄",
  },
  {
    id: "other",
    label: "Otros Ingresos Varios",
    desc: "Cualquier otra entrada de dinero no operacional",
    icon: "💰",
  },
];

const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo", icon: "💵" },
  { value: "bancolombia", label: "Bancolombia", icon: "🟡" },
  { value: "nequi", label: "Nequi", icon: "🟣" },
  { value: "davivienda", label: "Davivienda", icon: "🔴" },
  { value: "daviplata", label: "Daviplata", icon: "📱" },
  { value: "bold", label: "Bold (Datáfono/Link)", icon: "🔵" },
  { value: "sistecredito", label: "Sistecrédito", icon: "💳" },
  { value: "addi", label: "Addi", icon: "🟢" },
  { value: "transferencia", label: "Transferencia Bancaria", icon: "🏦" },
];

export function CreateCashIncomeModal({ open, onClose, onSuccess }: Props) {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [category, setCategory] = useState<CashIncomeCategory>("driver_refund");
  const [concept, setConcept] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerDoc, setPayerDoc] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [referenceCode, setReferenceCode] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar sede seleccionada
  useEffect(() => {
    if (open) {
      if (!isAllWarehouses && warehouseId) {
        setSelectedWarehouseId(warehouseId);
      } else if (warehouses.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(warehouseId || warehouses[0]?.id || "");
      }
      setCategory("driver_refund");
      setConcept("");
      setPayerName("");
      setPayerDoc("");
      setPayerPhone("");
      setAmountStr("");
      setPaymentMethod("efectivo");
      setReferenceCode("");
      setNotes("");
      setReceiptFiles([]);
      setError(null);
    }
  }, [open, isAllWarehouses, warehouseId, warehouses]);

  if (!open) return null;

  const parsedRaw = Number(String(amountStr).replace(",", "."));
  const numAmount = Number.isFinite(parsedRaw) ? Math.round(parsedRaw * 100) / 100 : 0;

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAmountStr(e.target.value);
    setError(null);
  }

  const isBankMethod = paymentMethod !== "efectivo";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!selectedWarehouseId) {
      setError("Por favor selecciona la sede que recibe el dinero.");
      return;
    }

    if (!payerName.trim()) {
      setError("Por favor ingresa el nombre de la persona que entrega el dinero.");
      return;
    }

    if (!concept.trim()) {
      setError("Por favor describe el concepto o motivo del ingreso.");
      return;
    }

    if (numAmount <= 0) {
      setError("El valor del ingreso debe ser mayor a cero.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedReceiptUrls: string[] = [];
      let uploadedReceiptUrl: string | null = null;
      let uploadedReceiptFilename: string | null = null;

      // 1. Subir soportes si se adjuntaron fotos
      if (receiptFiles.length > 0) {
        try {
          const uploads = await uploadClosureReceiptFiles(token, receiptFiles);
          uploadedReceiptUrls = uploads.map((u) => u.url);
          uploadedReceiptUrl = uploadedReceiptUrls[0] || null;
          uploadedReceiptFilename = uploads[0]?.filename || null;
        } catch (uploadErr: any) {
          throw new Error("Error al subir los soportes fotográficos: " + (uploadErr?.message || ""));
        }
      }

      // 2. Registrar el ingreso
      const res = await createCashIncome(token, {
        warehouseId: selectedWarehouseId,
        category,
        concept: concept.trim(),
        payerName: payerName.trim(),
        payerDoc: payerDoc.trim() || null,
        payerPhone: payerPhone.trim() || null,
        amount: numAmount,
        paymentMethod,
        referenceCode: referenceCode.trim() || null,
        notes: notes.trim() || null,
        receiptUrl: uploadedReceiptUrl,
        receiptUrls: uploadedReceiptUrls,
        receiptFilename: uploadedReceiptFilename,
      });

      onSuccess(res.item);
    } catch (err: any) {
      setError(err?.message || "Error al registrar el recibo de caja.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="create-income-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, maxHeight: "94vh", display: "flex", flexDirection: "column" }}
      >
        {/* Encabezado */}
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <PlusCircle size={22} color="#059669" />
            <div>
              <h2 id="create-income-title" className="inv-modal__title">
                Registrar Entrada de Dinero (Recibo de Caja)
              </h2>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                Ingresos varios, devoluciones de conductores, venta de rezagos/cuero o reintegros
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={onClose}
            aria-label="Cerrar modal"
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo del formulario con scroll */}
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "1.25rem", flex: 1 }}>
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "6px",
                color: "#dc2626",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{error}</div>
            </div>
          )}

          {/* Sede receptora */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              <Building2 size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Sede que recibe el dinero *
            </label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="inv-input"
              style={{ width: "100%", padding: "0.5rem" }}
              disabled={submitting || (!isAllWarehouses && Boolean(warehouseId))}
            >
              <option value="">-- Seleccionar Sede --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>

          {/* Categoría de Ingreso */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              <Tag size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Tipo de Ingreso *
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
              }}
            >
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    style={{
                      textAlign: "left",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #059669" : "1px solid #cbd5e1",
                      background: isSelected ? "rgba(5, 150, 105, 0.08)" : "#ffffff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ fontSize: "1.1rem" }}>{cat.icon}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: isSelected ? "#059669" : "#1e293b" }}>
                        {cat.label}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                      {cat.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Datos de quien entrega */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "0.85rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#1e293b", marginBottom: "0.5rem" }}>
              <User size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Persona o Tercero que Entrega la Plata
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "0.5rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", marginBottom: 2 }}>
                  Nombre completo *
                </label>
                <input
                  type="text"
                  className="inv-input"
                  style={{ width: "100%", padding: "0.45rem" }}
                  placeholder="Ej: Juan Pérez / Conductor"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", marginBottom: 2 }}>
                  Cédula / Documento
                </label>
                <input
                  type="text"
                  className="inv-input"
                  style={{ width: "100%", padding: "0.45rem" }}
                  placeholder="C.C. / NIT"
                  value={payerDoc}
                  onChange={(e) => setPayerDoc(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", marginBottom: 2 }}>
                  Teléfono
                </label>
                <input
                  type="text"
                  className="inv-input"
                  style={{ width: "100%", padding: "0.45rem" }}
                  placeholder="Celular"
                  value={payerPhone}
                  onChange={(e) => setPayerPhone(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          {/* Concepto / Motivo */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              <FileText size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Concepto / Motivo Detallado *
            </label>
            <input
              type="text"
              className="inv-input"
              style={{ width: "100%", padding: "0.5rem" }}
              placeholder="Ej: Devolución viáticos sobrantes ruta Girardot / Venta 12 retales de cuero sobrante"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          {/* Monto y Medio de Pago */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                <DollarSign size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Valor Recibido ($ COP) *
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontWeight: 700,
                    color: "#64748b",
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  className="inv-input"
                  style={{ width: "100%", padding: "0.5rem 0.5rem 0.5rem 1.6rem", fontSize: "1.1rem", fontWeight: 800, color: "#059669" }}
                  placeholder="0.00"
                  value={amountStr}
                  onChange={handleAmountChange}
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                <CreditCard size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Medio de Pago *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="inv-input"
                style={{ width: "100%", padding: "0.5rem", fontWeight: 600 }}
                disabled={submitting}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.icon} {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Si es banco / digital: Referencia */}
          {isBankMethod && (
            <div
              style={{
                background: "rgba(13, 148, 136, 0.05)",
                border: "1px dashed #0d9488",
                borderRadius: "8px",
                padding: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#0f766e", marginBottom: "0.25rem" }}>
                Nº Transacción / Referencia Bancaria (Opcional pero recomendado)
              </label>
              <input
                type="text"
                className="inv-input"
                style={{ width: "100%", padding: "0.45rem" }}
                placeholder="Ej: Aprobación #847291 / Comprobante Nequi"
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                disabled={submitting}
              />
              <div style={{ fontSize: "0.72rem", color: "#0f766e", marginTop: 4 }}>
                💡 En ingresos por cuenta o transferencias, es indispensable adjuntar la foto o comprobante bancario para que sea auditado en el cierre de caja.
              </div>
            </div>
          )}

          {/* Subida de soporte fotográfico / comprobante */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              Foto del Comprobante / Soporte Bancario {isBankMethod ? "(Recomendado)" : "(Opcional)"}
            </label>
            <ReceiptPhotosUploader
              files={receiptFiles}
              onChange={setReceiptFiles}
              disabled={submitting}
            />
          </div>

          {/* Observaciones */}
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>
              Observaciones adicionales (opcional)
            </label>
            <textarea
              className="inv-input"
              rows={2}
              style={{ width: "100%", padding: "0.45rem", fontSize: "0.82rem" }}
              placeholder="Notas internas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Botones de acción */}
          <div
            className="inv-modal__actions"
            style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0" }}
          >
            <button
              type="button"
              className="inv-btn inv-btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={submitting || numAmount <= 0}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#059669" }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="inv-spinner" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Generar Recibo de Caja y Voucher
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
