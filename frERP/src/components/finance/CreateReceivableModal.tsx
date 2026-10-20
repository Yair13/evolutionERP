import { useState, useEffect } from "react";
import { getTodayBogotaYmd } from "../../lib/dateUtils.js";
import { createReceivable } from "../../api/finance.js";
import { fetchCustomers, createCustomer, type Customer } from "../../api/inventory.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { Receipt, X, PlusCircle, User, AlertCircle, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CreateReceivableModal({ open, onClose, onSuccess }: Props) {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );

  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [totalAmountStr, setTotalAmountStr] = useState<string>("");
  const [balanceAmountStr, setBalanceAmountStr] = useState<string>("");
  const [balanceModified, setBalanceModified] = useState<boolean>(false);
  const [issueDate, setIssueDate] = useState<string>(getTodayBogotaYmd());
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Cliente
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Formulario rápido para nuevo cliente
  const [showCreateCustomer, setShowCreateCustomer] = useState<boolean>(false);
  const [newDisplayName, setNewDisplayName] = useState<string>("");
  const [newTaxId, setNewTaxId] = useState<string>("");
  const [newPhone, setNewPhone] = useState<string>("");
  const [newAddress, setNewAddress] = useState<string>("");
  const [creatingCustomer, setCreatingCustomer] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || ""));
      setInvoiceNumber("");
      setTotalAmountStr("");
      setBalanceAmountStr("");
      setBalanceModified(false);
      setIssueDate(getTodayBogotaYmd());
      setDueDate("");
      setNotes("");
      setCustomerSearch("");
      setCustomerList([]);
      setSelectedCustomer(null);
      setShowCreateCustomer(false);
      setNewDisplayName("");
      setNewTaxId("");
      setNewPhone("");
      setNewAddress("");
      setError(null);
    }
  }, [open, isAllWarehouses, warehouseId, warehouses]);

  // Actualizar automáticamente el saldo cuando se digita el total (a menos que el usuario lo haya editado manualmente)
  const handleTotalChange = (val: string) => {
    setTotalAmountStr(val);
    if (!balanceModified) {
      setBalanceAmountStr(val);
    }
  };

  const handleBalanceChange = (val: string) => {
    setBalanceAmountStr(val);
    setBalanceModified(true);
  };

  // Búsqueda en vivo de clientes
  useEffect(() => {
    if (!open || !token || !customerSearch.trim() || showCreateCustomer) {
      setCustomerList([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchCustomers(token, customerSearch.trim());
        setCustomerList(res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [customerSearch, token, open, showCreateCustomer]);

  if (!open) return null;

  async function handleCreateNewCustomer() {
    if (!token || !newDisplayName.trim()) {
      setError("Indica el nombre del cliente para crearlo.");
      return;
    }
    setError(null);
    setCreatingCustomer(true);
    try {
      const res = await createCustomer(token, {
        displayName: newDisplayName.trim(),
        taxId: newTaxId.trim() || undefined,
        phone: newPhone.trim() || undefined,
        address: newAddress.trim() || undefined,
      });
      setSelectedCustomer(res.item);
      setShowCreateCustomer(false);
      setNewDisplayName("");
      setNewTaxId("");
      setNewPhone("");
      setNewAddress("");
    } catch (err: any) {
      setError(err?.message || "Error al crear cliente.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!selectedWarehouseId) {
      setError("Selecciona la sede correspondiente a la deuda.");
      return;
    }

    if (!selectedCustomer) {
      setError("Debes seleccionar o registrar el cliente deudor.");
      return;
    }

    if (!invoiceNumber.trim()) {
      setError("Indica el número de factura o documento de referencia original.");
      return;
    }

    const totalNum = Number(totalAmountStr);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      setError("El valor total de la deuda debe ser mayor a 0.");
      return;
    }

    const balanceNum =
      balanceAmountStr.trim() !== "" ? Number(balanceAmountStr) : totalNum;
    if (!Number.isFinite(balanceNum) || balanceNum < 0) {
      setError("El saldo pendiente no puede ser negativo.");
      return;
    }

    if (balanceNum > totalNum) {
      setError("El saldo pendiente no puede ser mayor al valor total de la factura.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createReceivable(token, {
        warehouseId: selectedWarehouseId,
        customerId: selectedCustomer.id,
        invoiceNumber: invoiceNumber.trim(),
        totalAmount: totalNum,
        balanceAmount: balanceNum,
        issueDate: issueDate || null,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error al registrar el saldo inicial.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalNum = Number(totalAmountStr) || 0;
  const balanceNum = balanceAmountStr.trim() !== "" ? Number(balanceAmountStr) : totalNum;
  const previousPayments = Math.max(0, totalNum - balanceNum);

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="create-receivable-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto", overflowX: "hidden" }}
      >
        <div className="inv-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ background: "rgba(99, 102, 241, 0.15)", padding: 6, borderRadius: 8, display: "flex" }}>
              <Receipt size={22} color="#6366f1" />
            </div>
            <div>
              <h2 id="create-receivable-title" className="inv-modal__title" style={{ margin: 0 }}>
                Registrar Saldo Inicial / Factura Anterior
              </h2>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--inv-text-muted)" }}>
                Cargar cuentas por cobrar previas sin alterar stock ni caja de hoy
              </p>
            </div>
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
          {error && (
            <div className="inv-form-error" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Sede */}
          <label className="field">
            <span>Sede a la que pertenece la deuda *</span>
            {isAllWarehouses ? (
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
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

          {/* Selector o creación de Cliente */}
          <div style={{ background: "var(--inv-bg-elevated)", padding: "0.85rem", borderRadius: 8, border: "1px solid var(--inv-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-muted)" }}>
                Cliente deudor *
              </span>
            </div>

            {selectedCustomer ? (
              <div style={{ marginTop: "0.4rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--inv-bg-field)", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--inv-border)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <User size={16} color="#6366f1" />
                    <strong>{selectedCustomer.displayName}</strong>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)", marginTop: "0.15rem" }}>
                    CC / NIT: {selectedCustomer.taxId || "—"} · Tel: {selectedCustomer.phone || "—"} {selectedCustomer.address ? `· Dir: ${selectedCustomer.address}` : ""}
                  </div>
                  {Number(selectedCustomer.creditBalance) > 0 && (
                    <div style={{ color: "#10b981", fontSize: "0.82rem", fontWeight: 600, marginTop: "0.2rem" }}>
                      💰 Saldo a favor disponible: {formatMoney(Number(selectedCustomer.creditBalance))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  onClick={() => setSelectedCustomer(null)}
                  disabled={submitting}
                  style={{ fontSize: "0.8rem" }}
                >
                  Cambiar
                </button>
              </div>
            ) : showCreateCustomer ? (
              <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "var(--inv-bg-field)", borderRadius: 6, border: "1px solid var(--inv-border)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
                  Nuevo Cliente
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
                  <label className="field">
                    <span>Nombre completo *</span>
                    <input
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                      required
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
                      placeholder="Calle 123 #45-67"
                    />
                  </label>
                </div>
                <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="inv-btn inv-btn--primary"
                    onClick={handleCreateNewCustomer}
                    disabled={creatingCustomer}
                  >
                    {creatingCustomer ? "Guardando..." : "Guardar y usar"}
                  </button>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    onClick={() => setShowCreateCustomer(false)}
                    disabled={creatingCustomer}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: "0.5rem" }}>
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Buscar cliente por nombre, cédula o teléfono..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
                  disabled={submitting}
                />
                {searching && <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", display: "block", marginTop: 4 }}>Buscando clientes...</span>}
                {customerList.length > 0 && (
                  <ul className="inv-checkout-customer__list" style={{ maxHeight: 160, overflowY: "auto", margin: "0.5rem 0", listStyle: "none", padding: 0, border: "1px solid var(--inv-border)", borderRadius: 6 }}>
                    {customerList.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch("");
                          setCustomerList([]);
                        }}
                        className="inv-customer-item"
                        style={{ cursor: "pointer", padding: "8px 10px", borderBottom: "1px solid var(--inv-border)" }}
                      >
                        <strong>{c.displayName}</strong> — CC/NIT: {c.taxId || "—"} · Tel: {c.phone || "—"}
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateCustomer(true)}
                    className="inv-btn inv-btn--ghost"
                    style={{ fontSize: "0.8rem", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                    disabled={submitting}
                  >
                    <PlusCircle size={14} />
                    Crear nuevo cliente
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Factura / Documento Original */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
            <label className="field" style={{ minWidth: 0 }}>
              <span>N° Factura / Remisión Original *</span>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Ej: FAC-1025 o SALDO-01"
                required
                disabled={submitting}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label className="field" style={{ minWidth: 0 }}>
              <span>Fecha de la Factura Original</span>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={submitting}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label className="field" style={{ minWidth: 0 }}>
              <span>Fecha Límite / Vencimiento</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>
          </div>

          {/* Montos: Total Original y Saldo Pendiente Actual */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
            <label className="field" style={{ minWidth: 0 }}>
              <span>Valor Total Factura Original *</span>
              <input
                type="number"
                min="1"
                step="any"
                value={totalAmountStr}
                onChange={(e) => handleTotalChange(e.target.value)}
                placeholder="$ 0"
                required
                disabled={submitting}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label className="field" style={{ minWidth: 0 }}>
              <span>Saldo Pendiente Actual por Cobrar *</span>
              <input
                type="number"
                min="0"
                step="any"
                value={balanceAmountStr}
                onChange={(e) => handleBalanceChange(e.target.value)}
                placeholder="$ 0"
                required
                disabled={submitting}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>
          </div>

          {/* Resumen dinámico del saldo */}
          {totalNum > 0 && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: 8,
                background: balanceNum > 0 ? "rgba(99, 102, 241, 0.08)" : "rgba(16, 185, 129, 0.08)",
                border: balanceNum > 0 ? "1px solid rgba(99, 102, 241, 0.25)" : "1px solid rgba(16, 185, 129, 0.25)",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total Factura Original:</span>
                <strong>{formatMoney(totalNum)}</strong>
              </div>
              {previousPayments > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#10b981" }}>
                  <span>Abonos previos en sistema anterior:</span>
                  <strong>- {formatMoney(previousPayments)}</strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.3rem", borderTop: "1px dashed rgba(255,255,255,0.1)", fontSize: "0.95rem" }}>
                <span style={{ fontWeight: 600 }}>Saldo pendiente a recaudar en Evolution ERP:</span>
                <strong style={{ color: balanceNum > 0 ? "#6366f1" : "#10b981" }}>
                  {formatMoney(balanceNum)} {balanceNum === 0 ? " (Saldado)" : ""}
                </strong>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)", marginTop: "0.2rem" }}>
                ℹ️ Esta deuda no descarga inventario físico ni afecta el cierre de caja de hoy. Podrás registrarle abonos cuando el cliente pague.
              </span>
            </div>
          )}

          {/* Notas / Observaciones */}
          <label className="field">
            <span>Notas u Observaciones (Opcional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Saldo inicial por migración a Evolution ERP"
              disabled={submitting}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </label>

          {/* Botones de acción */}
          <div className="inv-modal__actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
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
              disabled={submitting || !selectedCustomer || totalNum <= 0}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <CheckCircle2 size={16} />
              <span>{submitting ? "Registrando..." : "Guardar Saldo Inicial"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
