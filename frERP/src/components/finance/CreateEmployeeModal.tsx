import { useState } from "react";
import { UserPlus, UserCheck, X } from "lucide-react";
import {
  createEmployee,
  updateEmployee,
  type EmployeeItem,
} from "../../api/finance.js";
import { useWarehouse } from "../../context/WarehouseContext.js";

type Props = {
  token: string;
  employeeToEdit?: EmployeeItem | null;
  onClose: () => void;
  onSuccess: (emp: EmployeeItem) => void;
};

export function CreateEmployeeModal({
  token,
  employeeToEdit,
  onClose,
  onSuccess,
}: Props) {
  const isEditing = Boolean(employeeToEdit);
  const { warehouses, warehouseId: currentWarehouseId, isAllWarehouses } = useWarehouse();

  const [fullName, setFullName] = useState(employeeToEdit?.fullName ?? "");
  const [documentType, setDocumentType] = useState(employeeToEdit?.documentType ?? "CC");
  const [documentNumber, setDocumentNumber] = useState(employeeToEdit?.documentNumber ?? "");
  const [phone, setPhone] = useState(employeeToEdit?.phone ?? "");
  const [email, setEmail] = useState(employeeToEdit?.email ?? "");
  const [position, setPosition] = useState(employeeToEdit?.position ?? "");
  const [warehouseId, setWarehouseId] = useState(
    employeeToEdit?.warehouseId ?? (isAllWarehouses ? "" : (currentWarehouseId ?? ""))
  );
  const [baseSalary, setBaseSalary] = useState(employeeToEdit?.baseSalary ? String(employeeToEdit.baseSalary) : "");
  const [paymentFrequency, setPaymentFrequency] = useState(employeeToEdit?.paymentFrequency ?? "quincenal");
  const [bankName, setBankName] = useState(employeeToEdit?.bankName ?? "");
  const [bankAccountType, setBankAccountType] = useState(employeeToEdit?.bankAccountType ?? "Ahorros");
  const [bankAccountNumber, setBankAccountNumber] = useState(employeeToEdit?.bankAccountNumber ?? "");
  const [notes, setNotes] = useState(employeeToEdit?.notes ?? "");
  const [isActive, setIsActive] = useState(employeeToEdit?.isActive ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("El nombre completo es obligatorio.");
      return;
    }
    if (!documentNumber.trim()) {
      setError("El número de documento es obligatorio.");
      return;
    }
    if (!position.trim()) {
      setError("El cargo o función es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const salaryNum = baseSalary ? parseFloat(baseSalary.replace(/[^0-9.]/g, "")) || 0 : 0;
      if (isEditing && employeeToEdit) {
        const res = await updateEmployee(token, employeeToEdit.id, {
          fullName,
          documentType,
          documentNumber,
          phone: phone.trim() || null,
          email: email.trim() || null,
          position,
          warehouseId: warehouseId || null,
          baseSalary: salaryNum,
          paymentFrequency,
          bankName: bankName.trim() || null,
          bankAccountType: bankAccountType.trim() || null,
          bankAccountNumber: bankAccountNumber.trim() || null,
          isActive,
          notes: notes.trim() || null,
        });
        onSuccess(res.item);
      } else {
        const res = await createEmployee(token, {
          fullName,
          documentType,
          documentNumber,
          phone: phone.trim() || null,
          email: email.trim() || null,
          position,
          warehouseId: warehouseId || null,
          baseSalary: salaryNum,
          paymentFrequency,
          bankName: bankName.trim() || null,
          bankAccountType: bankAccountType.trim() || null,
          bankAccountNumber: bankAccountNumber.trim() || null,
          notes: notes.trim() || null,
        });
        onSuccess(res.item);
      }
    } catch (err: any) {
      setError(err?.message || "Error al guardar colaborador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          color: "#0f172a",
          borderRadius: 16,
          maxWidth: 600,
          width: "100%",
          padding: "1.75rem",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.2)",
          border: "1px solid var(--border-color)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", color: "#0f172a" }}>
            {isEditing ? <UserCheck className="text-primary" /> : <UserPlus className="text-primary" />}
            {isEditing ? "Editar Colaborador / Empleado" : "Nuevo Colaborador / Empleado"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="fin-btn fin-btn--ghost fin-btn--sm"
            style={{ padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="fin-alert fin-alert--danger" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Nombre y Cargo */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Nombre Completo *</span>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Juan Pérez García"
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Cargo / Puesto *</span>
              <input
                type="text"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Ej. Vendedor, Cajero, Bodeguero"
              />
            </label>
          </div>

          {/* Documento */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "0.75rem" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Tipo Doc.</span>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                <option value="CC">CC</option>
                <option value="CE">CE</option>
                <option value="PPT">PPT</option>
                <option value="NIT">NIT</option>
                <option value="PAS">Pasaporte</option>
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Número de Documento *</span>
              <input
                type="text"
                required
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Cédula o identificación"
              />
            </label>
          </div>

          {/* Sede y Sueldo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Sede de Trabajo</span>
              {isAllWarehouses ? (
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Todas / Sin Sede Fija</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-elevated)", fontWeight: 600, fontSize: "0.9rem" }}>
                  {warehouses.find((w) => w.id === currentWarehouseId)?.name ?? "Sede actual"}
                </div>
              )}
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Sueldo Base ($ COP)</span>
              <input
                type="number"
                min="0"
                step="any"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                placeholder="Ej. 1300000"
              />
            </label>
          </div>

          {/* Frecuencia de pago y Contacto */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Periodicidad</span>
              <select value={paymentFrequency} onChange={(e) => setPaymentFrequency(e.target.value)}>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
                <option value="semanal">Semanal</option>
                <option value="diario">Diario</option>
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Teléfono / Celular</span>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="300 123 4567"
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Correo Electrónico</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@email.com"
              />
            </label>
          </div>

          {/* Datos Bancarios para Transferencia */}
          <div
            style={{
              padding: "1rem",
              background: "#f8fafc",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 8 }}>
              Datos Bancarios para Transferencias
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <label className="field" style={{ margin: 0 }}>
                <span>Banco / Plataforma</span>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bancolombia, Nequi..."
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>Tipo Cuenta</span>
                <select value={bankAccountType} onChange={(e) => setBankAccountType(e.target.value)}>
                  <option value="Ahorros">Ahorros</option>
                  <option value="Corriente">Corriente</option>
                  <option value="Nequi">Nequi</option>
                  <option value="Daviplata">Daviplata</option>
                </select>
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>Número de Cuenta</span>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Número de cuenta o celular"
                />
              </label>
            </div>
          </div>

          {/* Notas */}
          <label className="field" style={{ margin: 0 }}>
            <span>Notas u Observaciones</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles del contrato, condiciones acordadas, etc."
            />
          </label>

          {/* Estado activo (si está editando) */}
          {isEditing && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Colaborador Activo (Disponible para generar pagos de nómina)</span>
            </label>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={saving}
            >
              {saving ? "Guardando…" : isEditing ? "Actualizar Colaborador" : "Crear Colaborador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
