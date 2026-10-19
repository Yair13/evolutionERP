import { useState } from "react";
import { createSupplier, type SupplierItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { Truck, X, Building, CreditCard } from "lucide-react";

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
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="create-supplier-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Truck size={20} color="#6366f1" />
            <h2 id="create-supplier-title" className="inv-modal__title">
              Registrar Nuevo Proveedor
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

          {/* Información General */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--inv-text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>
            <Building size={16} />
            <span>Datos de la Empresa / Contacto</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Razón Social / Nombre *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Distribuidora Textil SAS"
                required
                autoFocus
              />
            </label>

            <label className="field">
              <span>NIT / Cédula</span>
              <input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="900123456-1"
              />
            </label>

            <label className="field">
              <span>Persona de contacto</span>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ej: Carlos Gómez"
              />
            </label>

            <label className="field">
              <span>Teléfono / Móvil</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="3101234567"
              />
            </label>

            <label className="field">
              <span>Correo Electrónico</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ventas@proveedor.com"
              />
            </label>

            <label className="field">
              <span>Dirección</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle 10 # 20-30"
              />
            </label>

            <label className="field">
              <span>Ciudad</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Medellín, Bogotá..."
              />
            </label>
          </div>

          {/* Información Bancaria */}
          <div style={{ marginTop: "0.5rem", padding: "0.85rem", background: "rgba(99, 102, 241, 0.04)", borderRadius: 8, border: "1px dashed rgba(99, 102, 241, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#818cf8", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.6rem" }}>
              <CreditCard size={16} />
              <span>Datos Bancarios para Transferencias / Pagos</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
              <label className="field">
                <span>Banco</span>
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bancolombia, Davivienda..."
                />
              </label>

              <label className="field">
                <span>Tipo de Cuenta</span>
                <select value={bankAccountType} onChange={(e) => setBankAccountType(e.target.value)}>
                  <option value="ahorros">Ahorros</option>
                  <option value="corriente">Corriente</option>
                </select>
              </label>

              <label className="field">
                <span>Número de Cuenta</span>
                <input
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="000-000000-00"
                />
              </label>
            </div>
          </div>

          <label className="field">
            <span>Notas u Observaciones</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones de pago, días de entrega, etc."
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
              {submitting ? "Guardando..." : "Guardar Proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
