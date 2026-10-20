import { useState, useEffect } from "react";
import { createSupplier, type SupplierItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { Truck, X, Building2, CreditCard, FileText, Check, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (supplier: SupplierItem) => void;
};

export function CreateSupplierModal({ open, onClose, onSuccess }: Props) {
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [contactName, setContactName] = useState("");

  // Datos bancarios para transferencias
  const [bankName, setBankName] = useState("");
  const [bankAccountType, setBankAccountType] = useState("ahorros");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (!name.trim()) {
      setError("El nombre o razón social del proveedor es obligatorio.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await createSupplier(token, {
        name: name.trim(),
        taxId: taxId.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        contactName: contactName.trim() || undefined,
        bankName: bankName.trim() || undefined,
        bankAccountType: bankAccountType || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onSuccess(res.item);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar proveedor.");
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
        aria-labelledby="create-supplier-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 680,
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
              <Truck size={22} />
            </div>
            <div>
              <h2
                id="create-supplier-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                Registrar Nuevo Proveedor
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                Ingresa los datos de contacto y cuentas bancarias para facturación y pagos
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inv-modal__close"
            onClick={onClose}
            disabled={submitting}
            title="Cerrar (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body / Scrollable Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flex: 1,
          }}
        >
          <div
            style={{
              padding: "24px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Sección: Datos Generales */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                <Building2 size={16} color="#6366f1" />
                <span>Datos de la Empresa / Contacto</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label className="field" style={{ gridColumn: "span 2" }}>
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    Razón Social o Nombre Comercial <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Distribuidora Textil SAS"
                    required
                    autoFocus
                    style={{ fontSize: "0.95rem" }}
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    NIT / Identificación
                  </span>
                  <input
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="900.123.456-1"
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    Persona de Contacto
                  </span>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Ej: Carlos Gómez"
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    Teléfono / Celular
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="310 123 4567"
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    Correo Electrónico
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ventas@proveedor.com"
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    Dirección
                  </span>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Calle 10 # 20-30"
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>
                    Ciudad
                  </span>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Medellín, Bogotá, Cali..."
                  />
                </label>
              </div>
            </div>

            {/* Sección: Información Bancaria */}
            <div
              style={{
                padding: "16px",
                background: "rgba(99, 102, 241, 0.03)",
                borderRadius: 14,
                border: "1px solid rgba(99, 102, 241, 0.16)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#4f46e5", fontSize: "0.88rem", fontWeight: 700 }}>
                  <CreditCard size={17} />
                  <span>Datos Bancarios para Transferencias / Pagos</span>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Opcional para programación de pagos</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 1.3fr", gap: "10px" }}>
                <label className="field" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.82rem" }}>Banco</span>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Bancolombia, Davivienda..."
                  />
                </label>

                <label className="field" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.82rem" }}>Tipo Cuenta</span>
                  <select
                    value={bankAccountType}
                    onChange={(e) => setBankAccountType(e.target.value)}
                  >
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                  </select>
                </label>

                <label className="field" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.82rem" }}>Número de Cuenta</span>
                  <input
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="000-000000-00"
                  />
                </label>
              </div>
            </div>

            {/* Sección: Observaciones */}
            <div>
              <label className="field">
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <FileText size={15} color="#64748b" />
                  <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.85rem" }}>Notas u Observaciones</span>
                </div>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condiciones de pago, días de entrega, acuerdos comerciales..."
                  style={{ resize: "vertical", minHeight: 64 }}
                />
              </label>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid rgba(15, 23, 42, 0.08)",
              background: "#f8fafc",
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
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Guardar Proveedor</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
