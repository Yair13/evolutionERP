import { useEffect, useState } from "react";
import type { ExitKind } from "../../features/inventory/inventory.types.js";
import { EXIT_KIND_OPTIONS } from "../../features/inventory/exit-labels.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { fetchCustomers, createCustomer, type Customer } from "../../api/inventory.js";

export type ExitCheckoutData = {
  exitKind: ExitKind;
  customerName: string;
  relatedInvoiceNumber: string;
  notes: string;
  customerId?: string | null;
  paymentMethod?: string | null;
  paymentBreakdown?: PaymentPart[] | null;
  destinationWarehouseId?: string | null;
};

export type PaymentPart = {
  method: string;
  amount: number;
};

const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "bancolombia", label: "Bancolombia" },
  { value: "davivienda", label: "Davivienda" },
  { value: "daviplata", label: "Daviplata" },
  { value: "addi", label: "Addi" },
  { value: "sistecredito", label: "Sistecrédito" },
  { value: "bold", label: "Bold" },
] as const;

type PaymentDraft = {
  id: number;
  method: string;
  amount: string;
};

type Props = {
  open: boolean;
  totalUnits: number;
  totalValue: number;
  confirming: boolean;
  onClose: () => void;
  onConfirm: (data: ExitCheckoutData) => void;
  isFactory?: boolean;
  /** Tipo de salida ya elegido en la página; si viene, se oculta el selector interno */
  lockedKind?: ExitKind;
  /** Para validar cambios en el checkout */
  exchangeReady?: { hasOutbound: boolean; hasReturn: boolean; netValue: number };
  /** Error devuelto por el servidor al confirmar (se muestra dentro del modal) */
  serverError?: string | null;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ExitCheckoutModal({
  open,
  totalUnits,
  totalValue,
  confirming,
  onClose,
  onConfirm,
  isFactory,
  lockedKind,
  exchangeReady,
  serverError,
}: Props) {
  const { token } = useAuth();
  const { warehouses, warehouseId: currentWarehouseId } = useWarehouse();

  const [exitKind, setExitKind] = useState<ExitKind>(lockedKind ?? "sale");
  const [customerName, setCustomerName] = useState("");
  const [relatedInvoiceNumber, setRelatedInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Clientes
  const [searchQuery, setSearchQuery] = useState("");
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Crear Cliente Express
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");

  // Métodos de pago y destinos
  const [payments, setPayments] = useState<PaymentDraft[]>([
    { id: 1, method: "efectivo", amount: String(totalValue) },
  ]);
  const [nextPaymentId, setNextPaymentId] = useState(2);
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");

  const destOptions = warehouses.filter((w) => {
    if (!w.is_active || w.id === currentWarehouseId) return false;
    if (exitKind === "return_to_factory") return w.is_factory === true;
    return true;
  });

  useEffect(() => {
    if (!open) return;
    setExitKind(lockedKind ?? "sale");
    setCustomerName("");
    setRelatedInvoiceNumber("");
    setNotes("");
    setError(null);
    setSearchQuery("");
    setCustomerList([]);
    setSelectedCustomer(null);
    setCustomerId(null);
    setShowCreateNew(false);
    setPayments([{ id: 1, method: "efectivo", amount: String(totalValue) }]);
    setNextPaymentId(2);
    setDestinationWarehouseId("");
  }, [open, totalValue, lockedKind]);

  // Buscador de clientes
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
      setCustomerName(res.item.displayName);
      setCustomerId(res.item.id);
      setShowCreateNew(false);
      setNewDisplayName("");
      setNewTaxId("");
      setNewPhone("");
      setNewAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    }
  }

  function submit() {
    if (exitKind === "sale" && !customerId) {
      setError("Debes seleccionar un cliente existente o registrar uno nuevo.");
      return;
    }
    if (
      (exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory") &&
      !destinationWarehouseId
    ) {
      setError("Debes seleccionar una sede de destino.");
      return;
    }
    if (exitKind === "warranty" && !relatedInvoiceNumber.trim()) {
      setError("Indica el número de factura de la salida original.");
      return;
    }
    if (exitKind === "exchange" && !relatedInvoiceNumber.trim()) {
      setError("Indica el número de factura de la salida original para el cambio.");
      return;
    }
    if (exitKind === "exchange") {
      if (!exchangeReady?.hasOutbound || !exchangeReady?.hasReturn) {
        setError("En un cambio debes marcar al menos un producto de salida y uno de retorno (cambio).");
        return;
      }
      if (exchangeReady.netValue === 0) {
        setError("El valor neto del cambio no puede ser $0; el producto de cambio no iguala la salida.");
        return;
      }
    }

    const paymentBreakdown: PaymentPart[] =
      exitKind === "sale"
        ? payments.map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount),
          }))
        : [];
    if (
      exitKind === "sale" &&
      paymentBreakdown.some(
        (payment) =>
          !payment.method || !Number.isFinite(payment.amount) || payment.amount <= 0
      )
    ) {
      setError("Cada método de pago debe tener un valor mayor que $0.");
      return;
    }
    const paidTotal = paymentBreakdown.reduce((sum, payment) => sum + payment.amount, 0);
    if (exitKind === "sale" && Math.abs(paidTotal - totalValue) >= 0.01) {
      const difference = totalValue - paidTotal;
      setError(
        difference > 0
          ? `Faltan ${formatMoney(difference)} por asignar en los métodos de pago.`
          : `Los pagos superan el total por ${formatMoney(Math.abs(difference))}.`
      );
      return;
    }

    setError(null);
    onConfirm({
      exitKind,
      customerName: customerName.trim(),
      relatedInvoiceNumber: relatedInvoiceNumber.trim(),
      notes: notes.trim(),
      customerId,
      paymentMethod:
        exitKind === "sale"
          ? paymentBreakdown.length === 1
            ? paymentBreakdown[0].method
            : "mixto"
          : null,
      paymentBreakdown: exitKind === "sale" ? paymentBreakdown : null,
      destinationWarehouseId:
        exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory"
          ? destinationWarehouseId
          : null,
    });
  }

  const allowedKinds = EXIT_KIND_OPTIONS.filter((opt) => {
    if (opt.value === "distribution") return isFactory;
    return true;
  });

  const selected = allowedKinds.find((o) => o.value === exitKind);
  const paidTotal = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const paymentDifference = totalValue - paidTotal;

  function updatePayment(id: number, patch: Partial<Pick<PaymentDraft, "method" | "amount">>) {
    setPayments((current) =>
      current.map((payment) => (payment.id === id ? { ...payment, ...patch } : payment))
    );
    setError(null);
  }

  function addPayment() {
    const used = new Set(payments.map((payment) => payment.method));
    const method = PAYMENT_METHODS.find((option) => !used.has(option.value))?.value;
    if (!method) {
      setError("Ya agregaste todos los métodos de pago disponibles.");
      return;
    }
    const remaining = Math.max(0, paymentDifference);
    setPayments((current) => [
      ...current,
      { id: nextPaymentId, method, amount: remaining > 0 ? String(remaining) : "" },
    ]);
    setNextPaymentId((current) => current + 1);
    setError(null);
  }

  function removePayment(id: number) {
    setPayments((current) => current.filter((payment) => payment.id !== id));
    setError(null);
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !confirming && onClose()}>
      <div
        className="inv-modal inv-modal--checkout"
        role="dialog"
        aria-labelledby="exit-checkout-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="exit-checkout-title">Finalizar salida</h2>
        <p className="inv-modal__summary">
          {exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory" ? (
            <>
              {totalUnits} unidades · <strong>Movimiento interno (sin valor)</strong>
            </>
          ) : (
            <>
              {totalUnits} unidades · <strong>{formatMoney(totalValue)}</strong>
            </>
          )}
        </p>

        {lockedKind ? (
          <div className="inv-checkout-kind__locked">
            <span className="inv-checkout-kind__locked-label">Tipo de salida</span>
            <strong>{selected?.label ?? "Salida"}</strong>
            {selected ? <p className="inv-checkout-kind__hint">{selected.description}</p> : null}
          </div>
        ) : (
          <fieldset className="inv-checkout-kinds">
            <legend className="inv-checkout-kinds__legend">Tipo de salida</legend>
            <div className="inv-checkout-kinds__grid inv-checkout-kinds__grid--wide">
              {allowedKinds.map((opt) => (
                <label
                  key={opt.value}
                  className={`inv-checkout-kind${exitKind === opt.value ? " inv-checkout-kind--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="exitKind"
                    value={opt.value}
                    checked={exitKind === opt.value}
                    onChange={() => {
                      setExitKind(opt.value);
                      setError(null);
                    }}
                  />
                  <span className="inv-checkout-kind__label">{opt.label}</span>
                </label>
              ))}
            </div>
            {selected ? <p className="inv-checkout-kind__hint">{selected.description}</p> : null}
          </fieldset>
        )}

        {/* Clientes para Ventas / Crédito / Cambio */}
        {(exitKind === "sale" || exitKind === "credit" || exitKind === "exchange") && (
          <div className="inv-checkout-customer">
            <h3 className="inv-checkout-customer__title">Información del Cliente</h3>

            {selectedCustomer ? (
              <div className="inv-checkout-customer__selected">
                <div className="inv-checkout-customer__selected-info">
                  <strong>{selectedCustomer.displayName}</strong>
                  <span>Cédula: {selectedCustomer.taxId || "—"} · Tel: {selectedCustomer.phone || "—"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerId(null);
                    setCustomerName("");
                  }}
                  className="inv-btn inv-btn--ghost inv-checkout-customer__change"
                >
                  Cambiar
                </button>
              </div>
            ) : showCreateNew ? (
              <div className="inv-checkout-customer__create">
                <span className="inv-checkout-customer__create-title">Registrar Nuevo Cliente</span>
                <div className="inv-checkout-customer__grid">
                  <label className="field">
                    <span>Nombre completo *</span>
                    <input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Juan Pérez" />
                  </label>
                  <label className="field">
                    <span>Cédula / NIT</span>
                    <input value={newTaxId} onChange={(e) => setNewTaxId(e.target.value)} placeholder="123456789" />
                  </label>
                  <label className="field">
                    <span>Teléfono</span>
                    <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="3001234567" />
                  </label>
                  <label className="field">
                    <span>Dirección</span>
                    <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Calle 123 #45-67" />
                  </label>
                </div>
                <div className="inv-checkout-customer__actions">
                  <button type="button" className="inv-btn inv-btn--primary" onClick={handleCreateCustomer}>
                    Guardar y seleccionar
                  </button>
                  <button type="button" className="inv-btn inv-btn--ghost" onClick={() => setShowCreateNew(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="field inv-checkout-customer__search">
                  <span>Buscar cliente existente (Nombre / Cédula / Teléfono)</span>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Escribe para buscar..."
                  />
                </label>
                {searching && <span className="inv-checkout-customer__hint">Buscando...</span>}
                {customerList.length > 0 && (
                  <ul className="inv-checkout-customer__list">
                    {customerList.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerName(c.displayName);
                          setCustomerId(c.id);
                          setSearchQuery("");
                          setCustomerList([]);
                        }}
                        className="inv-customer-item"
                      >
                        <strong>{c.displayName}</strong> - CC: {c.taxId || "—"} - Tel: {c.phone || "—"}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="inv-checkout-customer__new">
                  <span className="inv-checkout-customer__hint">¿No está registrado? </span>
                  <button
                    type="button"
                    onClick={() => setShowCreateNew(true)}
                    className="inv-checkout-customer__new-link"
                  >
                    Crear cliente nuevo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selector de Sede Destino */}
        {(exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory") && (
          <label className="field">
            <span>Sede de Destino *</span>
            <select
              value={destinationWarehouseId}
              onChange={(e) => setDestinationWarehouseId(e.target.value)}
            >
              <option value="">-- Selecciona una sede --</option>
              {destOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Métodos de Pago */}
        {exitKind === "sale" && (
          <section className="inv-checkout-payments" aria-labelledby="payment-methods-title">
            <div className="inv-checkout-payments__head">
              <div>
                <h3 id="payment-methods-title">Métodos de pago</h3>
                <p>Divide el total entre uno o varios medios.</p>
              </div>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                onClick={addPayment}
                disabled={payments.length >= PAYMENT_METHODS.length}
              >
                + Agregar método
              </button>
            </div>

            <div className="inv-checkout-payments__rows">
              {payments.map((payment, index) => (
                <div className="inv-checkout-payment-row" key={payment.id}>
                  <label className="field">
                    <span>Medio {index + 1}</span>
                    <select
                      value={payment.method}
                      onChange={(e) => updatePayment(payment.id, { method: e.target.value })}
                    >
                      {PAYMENT_METHODS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={payments.some(
                            (other) =>
                              other.id !== payment.id && other.method === option.value
                          )}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Valor</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={payment.amount}
                      onChange={(e) => updatePayment(payment.id, { amount: e.target.value })}
                      placeholder="0"
                    />
                  </label>
                  {payments.length > 1 ? (
                    <button
                      type="button"
                      className="inv-checkout-payment-row__remove"
                      onClick={() => removePayment(payment.id)}
                      aria-label={`Quitar pago con ${payment.method}`}
                      title="Quitar método"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div
              className={`inv-checkout-payments__balance${
                Math.abs(paymentDifference) < 0.01 ? " is-complete" : " is-pending"
              }`}
            >
              <span>Pagado: <strong>{formatMoney(paidTotal)}</strong></span>
              <span>
                {paymentDifference > 0
                  ? `Falta: ${formatMoney(paymentDifference)}`
                  : paymentDifference < 0
                    ? `Excede: ${formatMoney(Math.abs(paymentDifference))}`
                    : "Pago completo"}
              </span>
            </div>
          </section>
        )}

        {exitKind === "warranty" || exitKind === "exchange" ? (
          <label className="field">
            <span>Nº factura de la salida original *</span>
            <input
              value={relatedInvoiceNumber}
              onChange={(e) => setRelatedInvoiceNumber(e.target.value)}
              placeholder="Ej. BOSA-20260521-0001"
            />
          </label>
        ) : null}

        {exitKind === "exchange" ? (
          <p className="inv-checkout-exchange-hint">
            En el carrito marca el producto que entra como retorno. Valor neto actual:{" "}
            <strong>{formatMoney(exchangeReady?.netValue ?? totalValue)}</strong>
            {exchangeReady && exchangeReady.netValue === 0
              ? " — debe ser distinto de $0."
              : null}
          </p>
        ) : null}

        <label className="field">
          <span>Notas (opcional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones…" />
        </label>

        {error || serverError ? (
          <p className="form-error inv-checkout-error" role="alert">
            {error ?? serverError}
          </p>
        ) : null}

        <div className="inv-modal__actions inv-modal__actions--spaced">
          <button type="button" className="inv-btn inv-btn--ghost" disabled={confirming} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="inv-btn inv-btn--primary" disabled={confirming} onClick={submit}>
            {confirming ? "Generando…" : "Confirmar y generar comprobante"}
          </button>
        </div>
      </div>
    </div>
  );
}
