import { useState, useEffect } from "react";
import { updateSupplier, type SupplierItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { Truck, X, Building2, CreditCard, FileText, Check, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  supplier: SupplierItem | null;
  onClose: () => void;
  onSuccess: (updated: SupplierItem) => void;
};

export function EditSupplierModal({ open, supplier, onClose, onSuccess }: Props) {
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [contactName, setContactName] = useState("");

  // Datos bancarios
  const [bankName, setBankName] = useState("");
  const [bankAccountType, setBankAccountType] = useState("ahorros");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !supplier) return;
    setName(supplier.name || "");
    setTaxId(supplier.taxId || "");
    setPhone(supplier.phone || "");
    setEmail(supplier.email || "");
    setAddress(supplier.address || "");
    setCity(supplier.city || "");
    setContactName(supplier.contactName || "");
    setBankName(supplier.bankName || "");
    setBankAccountType(supplier.bankAccountType || "ahorros");
    setBankAccountNumber(supplier.bankAccountNumber || "");
    setNotes(supplier.notes || "");
    setIsActive(supplier.isActive !== false);
    setError(null);
  }, [open, supplier]);

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

  if (!open || !supplier) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !supplier) return;

    if (!name.trim()) {
      setError("El nombre o razón social del proveedor es obligatorio.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await updateSupplier(token, supplier.id, {
        name: name.trim(),
        taxId: taxId.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        contactName: contactName.trim() || null,
        bankName: bankName.trim() || null,
        bankAccountType: bankAccountType || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
        notes: notes.trim() || null,
        isActive,
      });

      onSuccess(res.item);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar proveedor.");
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
        zIndex: 1060,
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
        aria-labelledby="edit-supplier-title"
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
                id="edit-supplier-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                Editar Datos del Proveedor
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                Actualiza datos personales, comerciales y bancarios de {supplier.name}
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
                  border: "1px solid #fee2e2",
                  color: "#991b1b",
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <X size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* SECCIÓN 1: DATOS BÁSICOS */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "#334155",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <Building2 size={16} color="var(--accent)" />
                <span>Datos Básicos y de Contacto</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "14px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Nombre o Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Distribuidora Los Andes S.A.S"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    NIT o Documento
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="Ej. 900.123.456-7"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "14px",
                  marginTop: "14px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Nombre de Contacto
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Ej. Carlos Mendoza"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej. 310 123 4567"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ventas@proveedor.com"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr",
                  gap: "14px",
                  marginTop: "14px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Dirección Física
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej. Calle 45 # 12 - 34 Bodega 3"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ej. Bogotá D.C."
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: DATOS BANCARIOS */}
            <div
              style={{
                paddingTop: "16px",
                borderTop: "1px dashed rgba(15, 23, 42, 0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "#334155",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <CreditCard size={16} color="var(--accent)" />
                <span>Cuenta Bancaria para Pagos / Transferencias</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.4fr", gap: "14px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Entidad Bancaria
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Ej. Bancolombia, Davivienda..."
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Tipo de Cuenta
                  </label>
                  <select
                    value={bankAccountType}
                    onChange={(e) => setBankAccountType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: "6px",
                    }}
                  >
                    Número de Cuenta
                  </label>
                  <input
                    type="text"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="Ej. 123-456789-01"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontSize: "0.92rem",
                      color: "#0f172a",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3: NOTAS Y ESTADO */}
            <div
              style={{
                paddingTop: "16px",
                borderTop: "1px dashed rgba(15, 23, 42, 0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "#334155",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <FileText size={16} color="var(--accent)" />
                <span>Observaciones y Estado</span>
              </div>

              <div>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Días de crédito acordados, términos de entrega, persona de contacto de cobros..."
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "0.92rem",
                    color: "#0f172a",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.88rem", color: "#334155" }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
                  />
                  <span>Proveedor Activo (disponible para nuevas facturas y compras)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid rgba(15, 23, 42, 0.08)",
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                fontSize: "0.92rem",
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)",
                color: "#ffffff",
                fontSize: "0.92rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Guardando Cambios...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
