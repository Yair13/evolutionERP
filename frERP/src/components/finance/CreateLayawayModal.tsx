import { useState, useEffect } from "react";
import { createLayaway } from "../../api/finance.js";
import { fetchCustomers, createCustomer, type Customer } from "../../api/inventory.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { Bookmark, X, UserCheck, PlusCircle } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
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
] as const;

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CreateLayawayModal({ open, onClose, onSuccess }: Props) {
  const { token, user } = useAuth();
  const { warehouses, warehouseId } = useWarehouse();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(warehouseId || "");
  const [targetAmountStr, setTargetAmountStr] = useState<string>("");
  const [initialPaymentStr, setInitialPaymentStr] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Búsqueda y creación de cliente
  const [searchQuery, setSearchQuery] = useState("");
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Crear cliente rápido
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(warehouseId || (warehouses[0]?.id ?? ""));
      setTargetAmountStr("");
      setInitialPaymentStr("");
      setPaymentMethod("efectivo");
      setExpiryDate("");
      setNotes("");
      setSearchQuery("");
      setCustomerList([]);
      setSelectedCustomer(null);
      setShowCreateNew(false);
      setError(null);
    }
  }, [open, warehouseId, warehouses]);

  // Búsqueda de clientes
  useEffect(() => {
    if (!open || !token || !searchQuery.trim()) {
      setCustomerList([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetchCustomers(token, searchQuery.trim());
        setCustomerList(data.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQuery, token, open]);

  if (!open) return null;

  async function handleCreateCustomer() {
    if (!token || !newDisplayName.trim()) {
      setError("Indica el nombre para registrar el cliente.");
      return;
    }
    setError(null);
    try {
      const res = await createCustomer(token, {
        displayName: newDisplayName.trim(),
        taxId: newTaxId.trim() || undefined,
        phone: newPhone.trim() || undefined,
        address: newAddress.trim() || undefined,
      });
      setSelectedCustomer(res.item);
      setShowCreateNew(false);
      setNewDisplayName("");
      setNewTaxId("");
      setNewPhone("");
      setNewAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar cliente.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!selectedWarehouseId) {
      setError("Selecciona la sede del apartado.");
      return;
    }

    if (!selectedCustomer) {
      setError("Debes seleccionar o registrar un cliente.");
      return;
    }

    const targetAmount = Number(targetAmountStr) || 0;
    if (targetAmount <= 0) {
      setError("El valor total del apartado debe ser mayor a $0.");
      return;
    }

    const initialPayment = Number(initialPaymentStr) || 0;
    if (initialPayment < 0) {
      setError("El abono inicial no puede ser negativo.");
      return;
    }

    if (initialPayment > 0 && paymentMethod === "saldo_a_favor") {
      const availableBalance = selectedCustomer.creditBalance || 0;
      if (initialPayment > availableBalance) {
        setError(`El cliente solo cuenta con ${formatMoney(availableBalance)} de saldo a favor.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      await createLayaway(token, {
        warehouseId: selectedWarehouseId,
        customerId: selectedCustomer.id,
        targetAmount,
        initialPayment,
        paymentMethod: initialPayment > 0 ? paymentMethod : undefined,
        expiryDate: expiryDate || null,
        notes: notes.trim() || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.message === "insufficient_credit_balance") {
        setError("El cliente no tiene suficiente saldo a favor.");
      } else {
        setError(err instanceof Error ? err.message : "Error al crear el apartado.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const initialPaymentNum = Number(initialPaymentStr) || 0;
  const targetAmountNum = Number(targetAmountStr) || 0;
  const remaining = Math.max(0, targetAmountNum - initialPaymentNum);

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="create-layaway-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580 }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Bookmark size={20} color="#6366f1" />
            <h2 id="create-layaway-title" className="inv-modal__title">
              Nuevo Apartado (Plan Separe)
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

          {/* Sede */}
          <label className="field">
            <span>Sede *</span>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              disabled={submitting || (!user?.hasAdminAccess && warehouses.length <= 1)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </label>

          {/* Selección de Cliente */}
          <div className="inv-checkout-customer" style={{ margin: 0, padding: "0.75rem", background: "var(--inv-bg-elevated)", borderRadius: 8 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-muted)" }}>Cliente *</span>
            {selectedCustomer ? (
              <div className="inv-checkout-customer__selected" style={{ marginTop: "0.5rem" }}>
                <div className="inv-checkout-customer__selected-info">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <UserCheck size={16} color="#10b981" />
                    <strong>{selectedCustomer.displayName}</strong>
                  </div>
                  <span>CC/NIT: {selectedCustomer.taxId || "—"} · Tel: {selectedCustomer.phone || "—"}</span>
                  {selectedCustomer.creditBalance != null && selectedCustomer.creditBalance > 0 && (
                    <span style={{ color: "#10b981", fontSize: "0.8rem", fontWeight: 600 }}>
                      💰 Saldo a favor disponible: {formatMoney(selectedCustomer.creditBalance)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="inv-btn inv-btn--ghost inv-checkout-customer__change"
                >
                  Cambiar
                </button>
              </div>
            ) : showCreateNew ? (
              <div className="inv-checkout-customer__create" style={{ marginTop: "0.5rem" }}>
                <span className="inv-checkout-customer__create-title">Registrar Nuevo Cliente</span>
                <div className="inv-checkout-customer__grid">
                  <label className="field">
                    <span>Nombre completo *</span>
                    <input
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="Juan Pérez"
                    />
                  </label>
                  <label className="field">
                    <span>Cédula / NIT</span>
                    <input
                      value={newTaxId}
                      onChange={(e) => setNewTaxId(e.target.value)}
                      placeholder="123456789"
                    />
                  </label>
                  <label className="field">
                    <span>Teléfono</span>
                    <input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="3001234567"
                    />
                  </label>
                  <label className="field">
                    <span>Dirección</span>
                    <input
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Calle 123"
                    />
                  </label>
                </div>
                <div className="inv-checkout-customer__actions" style={{ marginTop: "0.5rem" }}>
                  <button type="button" className="inv-btn inv-btn--primary" onClick={handleCreateCustomer}>
                    Guardar y usar
                  </button>
                  <button type="button" className="inv-btn inv-btn--ghost" onClick={() => setShowCreateNew(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: "0.5rem" }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente por nombre, cédula o teléfono..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
                />
                {searching && <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)" }}>Buscando...</span>}
                {customerList.length > 0 && (
                  <ul className="inv-checkout-customer__list" style={{ maxHeight: 150, overflowY: "auto", margin: "0.5rem 0" }}>
                    {customerList.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setSearchQuery("");
                          setCustomerList([]);
                        }}
                        className="inv-customer-item"
                        style={{ cursor: "pointer", padding: "6px 8px" }}
                      >
                        <strong>{c.displayName}</strong> - CC: {c.taxId || "—"} - Tel: {c.phone || "—"}
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateNew(true)}
                    className="inv-btn inv-btn--ghost"
                    style={{ fontSize: "0.8rem", padding: "4px 8px" }}
                  >
                    <PlusCircle size={14} style={{ marginRight: 4 }} />
                    Crear nuevo cliente
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Valores */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label className="field">
              <span>Valor total del apartado *</span>
              <input
                type="number"
                min="0"
                step="any"
                value={targetAmountStr}
                onChange={(e) => setTargetAmountStr(e.target.value)}
                placeholder="$ 0"
                required
              />
            </label>
            <label className="field">
              <span>Fecha límite (opcional)</span>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </label>
          </div>

          {/* Abono inicial */}
          <div style={{ padding: "0.75rem", border: "1px dashed var(--inv-border)", borderRadius: 8, background: "rgba(99, 102, 241, 0.04)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#818cf8" }}>Abono Inicial (Opcional)</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
              <label className="field">
                <span>Monto abono</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialPaymentStr}
                  onChange={(e) => setInitialPaymentStr(e.target.value)}
                  placeholder="$ 0"
                />
              </label>
              <label className="field">
                <span>Método de pago</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={initialPaymentNum <= 0}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {targetAmountNum > 0 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.82rem", display: "flex", justifyContent: "space-between" }}>
                <span>Abonado: <strong style={{ color: "#10b981" }}>{formatMoney(initialPaymentNum)}</strong></span>
                <span>Saldo pendiente: <strong style={{ color: "#f59e0b" }}>{formatMoney(remaining)}</strong></span>
              </div>
            )}
          </div>

          <label className="field">
            <span>Notas / Artículos apartados (opcional)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Separa Vestido Fiesta Talla M azul y Zapatos #37"
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
              {submitting ? "Guardando..." : "Crear Apartado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
