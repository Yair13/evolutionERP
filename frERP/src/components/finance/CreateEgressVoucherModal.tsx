import { useState, useEffect } from "react";
import { createCashOutflow, fetchSuppliers, type CashOutflowItem, type SupplierItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { FileMinus, X, Building2, AlertCircle } from "lucide-react";

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
  const { token, user } = useAuth();
  const { warehouses, warehouseId } = useWarehouse();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(warehouseId || "");
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
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="create-egress-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileMinus size={20} color="#ef4444" />
            <h2 id="create-egress-title" className="inv-modal__title">
              Registrar Comprobante de Egreso (Salida de Dinero)
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

          {/* Sede de origen del dinero */}
          <label className="field">
            <span>Sede de donde sale el dinero *</span>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              disabled={submitting || (!user?.hasAdminAccess && warehouses.length <= 1)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code}) {w.is_factory ? "— Fábrica / Bodega" : ""}
                </option>
              ))}
            </select>
          </label>

          {/* Advertencia / Regla de salida bancaria */}
          {!isMainWarehouse ? (
            <div
              style={{
                padding: "0.6rem 0.8rem",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: 6,
                fontSize: "0.82rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#f59e0b",
              }}
            >
              <AlertCircle size={18} />
              <span>
                <strong>Sede Operativa:</strong> Las salidas de dinero se realizan exclusivamente en <strong>Efectivo</strong> de caja menor. Las transferencias por cuenta solo se autorizan desde la Bodega Principal por secretaría.
              </span>
            </div>
          ) : (
            <div
              style={{
                padding: "0.6rem 0.8rem",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: 6,
                fontSize: "0.82rem",
                color: "#818cf8",
              }}
            >
              🏢 <strong>Bodega Principal (Secretaría):</strong> Autorizada para egresos en efectivo y giros bancarios directos.
            </div>
          )}

          {/* Beneficiario / Quien recibe */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Persona a quien se entrega el dinero (Beneficiario) *</span>
              <input
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Ej: Pedro Martínez / Mensajero"
                required
                autoFocus
              />
            </label>

            <label className="field">
              <span>Cédula / Documento</span>
              <input
                value={beneficiaryDoc}
                onChange={(e) => setBeneficiaryDoc(e.target.value)}
                placeholder="12345678"
              />
            </label>
          </div>

          {/* Concepto y Monto */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Concepto / Motivo de la salida *</span>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej: Compra de insumos de aseo / Viáticos"
                required
              />
            </label>

            <label className="field">
              <span>Valor Salida *</span>
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
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.75rem" }}>
            <label className="field">
              <span>Medio de Pago / Cuenta *</span>
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
              <span>N° Comprobante / Ref</span>
              <input
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="N° transferencia / recibo"
              />
            </label>
          </div>

          {/* Asociar a proveedor si aplica */}
          <div style={{ background: "var(--inv-bg-elevated)", padding: "0.75rem", borderRadius: 8 }}>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Building2 size={15} />
                Asociar a Proveedor (Opcional)
              </span>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
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

          <label className="field">
            <span>Notas u Observaciones</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles adicionales del egreso..."
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
              {submitting ? "Generando..." : "Emitir Comprobante de Egreso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
