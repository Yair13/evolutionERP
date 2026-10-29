import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import type { ExitKind } from "../../features/inventory/inventory.types.js";
import { EXIT_KIND_OPTIONS } from "../../features/inventory/exit-labels.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { fetchCustomers, createCustomer, type Customer } from "../../api/inventory.js";
import { fetchCustomerActiveLayaway, type LayawaySummaryItem, uploadClosureReceiptFiles } from "../../api/finance.js";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";
import {
  loadPosDraft,
  saveCheckoutDraft,
  clearCheckoutDraft,
  type CachedPhoto,
} from "../../lib/posDraft.js";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const parts = base64.split(",");
  const byteString = atob(parts[1] || parts[0]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], filename, { type: mimeType });
}

export type ExitCheckoutData = {
  exitKind: ExitKind;
  customerName: string;
  relatedInvoiceNumber: string;
  notes: string;
  customerId?: string | null;
  paymentMethod?: string | null;
  paymentBreakdown?: PaymentPart[] | null;
  destinationWarehouseId?: string | null;
  layawayId?: string | null;
  receiptUrl?: string | null;
  receiptUrls?: string[] | null;
  receiptFilename?: string | null;
  discountAmount?: number;
  discountReason?: string | null;
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
  { value: "saldo_a_favor", label: "Saldo a favor" },
  { value: "apartado", label: "Apartado / Plan Separe" },
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

  // Descuento a la factura (en pesos COP) - Restricción máximo 10%
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");
  const [discountLimitWarning, setDiscountLimitWarning] = useState<string | null>(null);

  const subtotal = totalValue;
  const maxDiscount = Math.round(subtotal * 0.10);
  const discountPercent = subtotal > 0 ? Math.round((discountAmount / subtotal) * 1000) / 10 : 0;
  const netTotal = Math.max(0, subtotal - discountAmount);

  // Métodos de pago y destinos
  const [payments, setPayments] = useState<PaymentDraft[]>([
    { id: 1, method: "efectivo", amount: String(totalValue) },
  ]);
  const [nextPaymentId, setNextPaymentId] = useState(2);
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [activeLayaway, setActiveLayaway] = useState<LayawaySummaryItem | null>(null);
  const [selectedLayawayId, setSelectedLayawayId] = useState<string | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const destOptions = warehouses.filter((w) => {
    if (!w.is_active || w.id === currentWarehouseId) return false;
    if (exitKind === "return_to_factory") return w.is_factory === true;
    return true;
  });

  const prevOpenRef = useRef(false);

  useEffect(() => {
    // Solo inicializar cuando el modal pasa de cerrado a abierto
    if (open && !prevOpenRef.current) {
      const existingDraft = currentWarehouseId
        ? loadPosDraft("exit", currentWarehouseId)?.checkoutDraft
        : undefined;

      const initKind = lockedKind ?? "sale";
      setExitKind(initKind);
      setCustomerName(existingDraft?.customerName ?? "");
      setRelatedInvoiceNumber(existingDraft?.relatedInvoiceNumber ?? "");
      setNotes(existingDraft?.notes ?? "");
      setError(null);
      setSearchQuery("");
      setCustomerList([]);
      setSelectedCustomer(existingDraft?.selectedCustomer ?? null);
      setCustomerId(existingDraft?.customerId ?? null);
      setActiveLayaway(null);
      setSelectedLayawayId(existingDraft?.selectedLayawayId ?? null);
      setShowCreateNew(false);
      setDestinationWarehouseId(existingDraft?.destinationWarehouseId ?? "");

      const maxAllowedDiscount = Math.round(totalValue * 0.10);
      const initDiscount = Math.min(existingDraft?.discountAmount ?? 0, maxAllowedDiscount);
      const initDiscountReason = existingDraft?.discountReason ?? "";
      setDiscountAmount(initDiscount);
      setDiscountReason(initDiscountReason);
      setDiscountLimitWarning(null);
      const initialNetTotal = Math.max(0, totalValue - initDiscount);

      // Restaurar fotos previamente seleccionadas si la tablet se recargó
      if (existingDraft?.cachedPhotos && existingDraft.cachedPhotos.length > 0) {
        try {
          const restored = existingDraft.cachedPhotos.map((p) =>
            base64ToFile(p.base64, p.name, p.type)
          );
          setReceiptFiles(restored);
        } catch {
          setReceiptFiles([]);
        }
      } else {
        setReceiptFiles([]);
      }
      setUploadingReceipt(false);

      if (existingDraft?.payments && existingDraft.payments.length > 0) {
        setPayments(existingDraft.payments);
        const maxId = existingDraft.payments.reduce((m, p) => Math.max(m, p.id), 1);
        setNextPaymentId(maxId + 1);
      } else {
        if (initKind === "credit") {
          setPayments([{ id: 1, method: "efectivo", amount: "" }]);
        } else {
          setPayments([{ id: 1, method: "efectivo", amount: String(initialNetTotal) }]);
        }
        setNextPaymentId(2);
      }
    }
    prevOpenRef.current = open;
  }, [open, lockedKind, currentWarehouseId, totalValue]);

  // Guardar estado del checkout en borrador local por si la tablet recarga al usar la cámara
  useEffect(() => {
    if (!open || !currentWarehouseId) return;
    let cancelled = false;

    const t = window.setTimeout(async () => {
      let cachedPhotos: CachedPhoto[] = [];
      try {
        for (const file of receiptFiles) {
          if (file.size < 2 * 1024 * 1024) {
            const base64 = await fileToBase64(file);
            cachedPhotos.push({ name: file.name, type: file.type, base64 });
          }
        }
      } catch {
        /* ignore storage errors */
      }
      if (cancelled) return;

      saveCheckoutDraft(currentWarehouseId, {
        open: true,
        customerName,
        customerId,
        selectedCustomer,
        payments,
        notes,
        relatedInvoiceNumber,
        destinationWarehouseId,
        selectedLayawayId,
        cachedPhotos,
        discountAmount,
        discountReason,
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    open,
    currentWarehouseId,
    customerName,
    customerId,
    selectedCustomer,
    payments,
    notes,
    relatedInvoiceNumber,
    destinationWarehouseId,
    selectedLayawayId,
    receiptFiles,
    discountAmount,
    discountReason,
  ]);

  // Consulta si el cliente tiene un apartado activo con saldo acumulado
  useEffect(() => {
    if (!open || !token || !customerId) {
      setActiveLayaway(null);
      setSelectedLayawayId(null);
      return;
    }
    let cancelled = false;
    fetchCustomerActiveLayaway(token, customerId)
      .then((res) => {
        if (!cancelled) {
          setActiveLayaway(res.item || null);
        }
      })
      .catch((err) => {
        console.error("Error fetching customer active layaway:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, customerId]);

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

  async function submit() {
    if (exitKind === "credit" && !customerId) {
      setError("El cliente es estrictamente obligatorio para registrar una salida a crédito.");
      return;
    }
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

    if (discountAmount > maxDiscount) {
      setError(
        `El descuento no puede superar el 10% del valor de la factura (máximo permitido: ${formatMoney(maxDiscount)}).`
      );
      return;
    }

    const paymentBreakdown: PaymentPart[] =
      exitKind === "sale" || exitKind === "credit"
        ? payments
            .filter((payment) => Number(payment.amount) > 0)
            .map((payment) => ({
              method: payment.method,
              amount: Number(payment.amount),
            }))
        : [];

    if (exitKind === "sale") {
      if (netTotal > 0) {
        if (
          paymentBreakdown.length === 0 ||
          paymentBreakdown.some(
            (payment) => !payment.method || !Number.isFinite(payment.amount) || payment.amount <= 0
          )
        ) {
          setError("Cada método de pago debe tener un valor mayor que $0.");
          return;
        }
        const paidTotal = paymentBreakdown.reduce((sum, payment) => sum + payment.amount, 0);
        if (Math.abs(paidTotal - netTotal) >= 0.01) {
          const difference = netTotal - paidTotal;
          setError(
            difference > 0
              ? `Faltan ${formatMoney(difference)} por asignar en los métodos de pago.`
              : `Los pagos superan el total neto por ${formatMoney(Math.abs(difference))}.`
          );
          return;
        }
      }
    }

    if (exitKind === "credit") {
      const paidTotal = paymentBreakdown.reduce((sum, payment) => sum + payment.amount, 0);
      if (paidTotal > netTotal + 0.01) {
        setError(
          `El abono inicial (${formatMoney(paidTotal)}) no puede superar el total neto de la venta (${formatMoney(netTotal)}).`
        );
        return;
      }
    }

    let uploadedUrl: string | null = null;
    let uploadedUrls: string[] = [];
    let uploadedFilename: string | null = null;

    if (receiptFiles.length > 0 && token) {
      setUploadingReceipt(true);
      try {
        const upRes = await uploadClosureReceiptFiles(token, receiptFiles);
        if (upRes.length > 0) {
          uploadedUrl = upRes[0]?.publicUrl || null;
          uploadedFilename = upRes[0]?.filename || null;
          uploadedUrls = upRes.map((u) => u.publicUrl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir comprobante(s)");
        setUploadingReceipt(false);
        return;
      } finally {
        setUploadingReceipt(false);
      }
    }

    if (currentWarehouseId) clearCheckoutDraft(currentWarehouseId);
    setError(null);
    onConfirm({
      exitKind,
      customerName: customerName.trim(),
      relatedInvoiceNumber: relatedInvoiceNumber.trim(),
      notes: notes.trim(),
      customerId,
      paymentMethod:
        netTotal === 0
          ? "obsequio"
          : paymentBreakdown.length === 1
          ? paymentBreakdown[0].method
          : paymentBreakdown.length > 1
          ? "mixto"
          : null,
      paymentBreakdown: paymentBreakdown.length > 0 ? paymentBreakdown : null,
      destinationWarehouseId:
        exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory"
          ? destinationWarehouseId
          : null,
      layawayId: selectedLayawayId || null,
      receiptUrl: uploadedUrl,
      receiptUrls: uploadedUrls.length > 0 ? uploadedUrls : null,
      receiptFilename: uploadedFilename,
      discountAmount: discountAmount > 0 ? discountAmount : 0,
      discountReason: discountAmount > 0 ? discountReason.trim() || null : null,
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
  const paymentDifference = netTotal - paidTotal;

  function handleDiscountChange(rawVal: string) {
    const digits = rawVal.replace(/[^\d]/g, "");
    const parsed = digits ? Number(digits) : 0;
    if (parsed > maxDiscount) {
      setDiscountAmount(maxDiscount);
      const newNet = Math.max(0, subtotal - maxDiscount);
      if (payments.length === 1 && exitKind === "sale") {
        setPayments([{ ...payments[0], amount: String(newNet) }]);
      }
      setDiscountLimitWarning(
        `Restricción: El descuento máximo permitido es el 10% de la factura (${formatMoney(maxDiscount)}).`
      );
      return;
    }
    setDiscountLimitWarning(null);
    setDiscountAmount(parsed);
    const newNet = Math.max(0, subtotal - parsed);
    if (payments.length === 1 && exitKind === "sale") {
      setPayments([{ ...payments[0], amount: String(newNet) }]);
    }
    setError(null);
  }

  function handleSetMaxDiscount() {
    setDiscountAmount(maxDiscount);
    setDiscountLimitWarning(null);
    if (!discountReason) {
      setDiscountReason("Descuento comercial (10%)");
    }
    const newNet = Math.max(0, subtotal - maxDiscount);
    if (payments.length === 1 && exitKind === "sale") {
      setPayments([{ ...payments[0], amount: String(newNet) }]);
    }
    setError(null);
  }

  function handleClearDiscount() {
    setDiscountAmount(0);
    setDiscountLimitWarning(null);
    if (discountReason === "Obsequio 100%" || discountReason === "Descuento comercial (10%)") {
      setDiscountReason("");
    }
    if (payments.length === 1 && exitKind === "sale") {
      setPayments([{ ...payments[0], amount: String(subtotal) }]);
    }
    setError(null);
  }

  function handleClose() {
    if (confirming || uploadingReceipt) return;
    if (currentWarehouseId) clearCheckoutDraft(currentWarehouseId);
    onClose();
  }

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
    <div className="inv-modal-backdrop" role="presentation">
      <div
        className="inv-modal inv-modal--checkout"
        role="dialog"
        aria-labelledby="exit-checkout-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.25rem" }}>
          <h2 id="exit-checkout-title" style={{ margin: 0 }}>Finalizar salida</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={confirming || uploadingReceipt}
            aria-label="Cerrar modal"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--inv-text-muted, #94a3b8)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
            }}
          >
            <X size={22} />
          </button>
        </div>
        <p className="inv-modal__summary">
          {exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory" ? (
            <>
              {totalUnits} unidades · <strong>Movimiento interno (sin valor)</strong>
            </>
          ) : (
            <>
              {totalUnits} unidades ·{" "}
              {discountAmount > 0 ? (
                <>
                  <span style={{ textDecoration: "line-through", color: "var(--inv-text-muted, #94a3b8)", marginRight: "6px" }}>
                    {formatMoney(subtotal)}
                  </span>
                  <strong style={{ color: "#16a34a" }}>{formatMoney(netTotal)}</strong>
                </>
              ) : (
                <strong>{formatMoney(totalValue)}</strong>
              )}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 className="inv-checkout-customer__title" style={{ margin: 0 }}>
                Información del Cliente {(exitKind === "credit" || exitKind === "sale") && <span style={{ color: "#ef4444" }}>*</span>}
              </h3>
              {(exitKind === "credit" || exitKind === "sale") && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: selectedCustomer ? "#dcfce7" : "#fee2e2",
                    color: selectedCustomer ? "#166534" : "#991b1b",
                    border: `1px solid ${selectedCustomer ? "#bbf7d0" : "#fecaca"}`,
                  }}
                >
                  {selectedCustomer ? "✓ Cliente asignado" : "Obligatorio *"}
                </span>
              )}
            </div>

            {selectedCustomer ? (
              <div className="inv-checkout-customer__selected">
                <div className="inv-checkout-customer__selected-info">
                  <strong>{selectedCustomer.displayName}</strong>
                  <span>Cédula: {selectedCustomer.taxId || "—"} · Tel: {selectedCustomer.phone || "—"}</span>
                  {selectedCustomer.creditBalance != null && selectedCustomer.creditBalance > 0 ? (
                    <div style={{ marginTop: "0.35rem", color: "#10b981", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span>💰 Saldo a favor: {formatMoney(selectedCustomer.creditBalance)}</span>
                      <button
                        type="button"
                        style={{
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid #10b981",
                          color: "#10b981",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          const maxToUse = Math.min(selectedCustomer.creditBalance || 0, totalValue);
                          if (exitKind === "sale") {
                            if (maxToUse === totalValue) {
                              setPayments([{ id: 1, method: "saldo_a_favor", amount: String(maxToUse) }]);
                            } else {
                              setPayments([
                                { id: 1, method: "saldo_a_favor", amount: String(maxToUse) },
                                { id: 2, method: "efectivo", amount: String(totalValue - maxToUse) },
                              ]);
                            }
                          } else if (exitKind === "credit") {
                            setPayments([{ id: 1, method: "saldo_a_favor", amount: String(maxToUse) }]);
                          }
                        }}
                      >
                        Aplicar saldo a favor
                      </button>
                    </div>
                  ) : null}

                  {activeLayaway && activeLayaway.paidAmount > 0 ? (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        padding: "8px 10px",
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <div style={{ color: "#818cf8", fontSize: "0.85rem", fontWeight: 700 }}>
                          🔖 Apartado Activo: {activeLayaway.code}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--inv-text-muted, #94a3b8)" }}>
                          Abono acumulado: <strong style={{ color: "var(--inv-text, #fff)" }}>{formatMoney(activeLayaway.paidAmount)}</strong>
                          {activeLayaway.paidAmount >= totalValue ? (
                            <span style={{ color: "#10b981", marginLeft: "0.35rem" }}>
                              (Cubre el 100% · {formatMoney(activeLayaway.paidAmount - totalValue)} pasará a Saldo a Favor)
                            </span>
                          ) : (
                            <span style={{ color: "#f59e0b", marginLeft: "0.35rem" }}>
                              (Faltan {formatMoney(totalValue - activeLayaway.paidAmount)} por pagar)
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{
                          background: selectedLayawayId === activeLayaway.id ? "#10b981" : "#6366f1",
                          border: "none",
                          color: "#fff",
                          borderRadius: 4,
                          padding: "4px 10px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setSelectedLayawayId(activeLayaway.id);
                          const maxToUse = Math.min(activeLayaway.paidAmount, totalValue);
                          if (exitKind === "sale") {
                            if (maxToUse === totalValue) {
                              setPayments([{ id: 1, method: "apartado", amount: String(maxToUse) }]);
                            } else {
                              setPayments([
                                { id: 1, method: "apartado", amount: String(maxToUse) },
                                { id: 2, method: "efectivo", amount: String(totalValue - maxToUse) },
                              ]);
                            }
                          } else if (exitKind === "credit") {
                            setPayments([{ id: 1, method: "apartado", amount: String(maxToUse) }]);
                          }
                        }}
                      >
                        {selectedLayawayId === activeLayaway.id ? "✓ Apartado aplicado" : "Aplicar apartado"}
                      </button>
                    </div>
                  ) : null}
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
                  <span>
                    Buscar cliente existente (Nombre / Cédula / Teléfono){" "}
                    {(exitKind === "credit" || exitKind === "sale") && <span style={{ color: "#ef4444" }}>*</span>}
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Escribe para buscar..."
                    style={
                      (exitKind === "credit" || exitKind === "sale") && !selectedCustomer
                        ? { borderColor: "rgba(239, 68, 68, 0.5)" }
                        : undefined
                    }
                  />
                </label>
                {(exitKind === "credit" || exitKind === "sale") && !selectedCustomer && (
                  <div
                    style={{
                      margin: "0.4rem 0 0.6rem 0",
                      padding: "0.4rem 0.65rem",
                      borderRadius: 6,
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      fontSize: "0.8rem",
                      color: "#f87171",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <span>⚠️</span>
                    <span>
                      {exitKind === "credit"
                        ? "Para ventas a crédito es obligatorio seleccionar un cliente existente o registrar uno nuevo para generar la cuenta por cobrar."
                        : "Para emitir la venta debes seleccionar un cliente registrado o registrar uno nuevo."}
                    </span>
                  </div>
                )}
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

        {/* Descuento comercial o por obsequio a la Factura (Venta / Crédito) */}
        {(exitKind === "sale" || exitKind === "credit") && (
          <section
            style={{
              padding: "1rem",
              borderRadius: "10px",
              border: "1px solid var(--inv-border, #e2e8f0)",
              background: discountAmount > 0 ? "rgba(16, 185, 129, 0.04)" : "var(--inv-card-bg, #f8fafc)",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.1rem" }}>🏷️</span>
                <strong style={{ fontSize: "0.95rem", color: "var(--inv-text-main, #1e293b)" }}>
                  Descuento a la Factura
                </strong>
                <span
                  style={{
                    fontSize: "0.73rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(245, 158, 11, 0.12)",
                    color: "#b45309",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  Máx. 10% ({formatMoney(maxDiscount)})
                </span>
                {discountAmount > 0 && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#dcfce7",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    -{formatMoney(discountAmount)} ({discountPercent}%) aplicado
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {discountAmount > 0 ? (
                  <button
                    type="button"
                    onClick={handleClearDiscount}
                    className="inv-btn inv-btn--ghost"
                    style={{ fontSize: "0.75rem", padding: "3px 8px", height: "auto" }}
                  >
                    Quitar descuento
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSetMaxDiscount}
                    className="inv-btn inv-btn--ghost"
                    style={{ fontSize: "0.75rem", padding: "3px 8px", height: "auto", color: "#16a34a" }}
                    title="Aplica el descuento máximo permitido del 10%"
                  >
                    🏷️ Aplicar máx. (10%)
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  Valor a descontar ($ — máx. {formatMoney(maxDiscount)})
                </span>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontWeight: 600 }}>
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={discountAmount > 0 ? discountAmount.toLocaleString("es-CO") : ""}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    style={{ paddingLeft: "26px", fontWeight: 600 }}
                  />
                </div>
              </label>

              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Motivo del descuento</span>
                <input
                  type="text"
                  placeholder="Ej: Promoción, Fidelización, Descuento autorizado..."
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                />
              </label>
            </div>

            {discountLimitWarning && (
              <div
                role="alert"
                style={{
                  marginTop: "0.6rem",
                  padding: "0.45rem 0.7rem",
                  borderRadius: "6px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#dc2626",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                ⚠️ {discountLimitWarning}
              </div>
            )}

            {/* Resumen numérico claro */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px dashed var(--inv-border, #cbd5e1)",
                fontSize: "0.85rem",
                color: "var(--inv-text-muted, #64748b)",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <span>Subtotal: <strong>{formatMoney(subtotal)}</strong></span>
              {discountAmount > 0 && (
                <span style={{ color: "#dc2626" }}>
                  Descuento: <strong>- {formatMoney(discountAmount)}</strong>
                </span>
              )}
              <span style={{ fontSize: "0.95rem", color: "var(--inv-text-main, #0f172a)" }}>
                Total neto a pagar: <strong style={{ color: "#16a34a", fontSize: "1.05rem" }}>{formatMoney(netTotal)}</strong>
              </span>
            </div>
          </section>
        )}

        {/* Métodos de Pago o Abono Inicial */}
        {(exitKind === "sale" || exitKind === "credit") && (
          <section className="inv-checkout-payments" aria-labelledby="payment-methods-title">
            <div className="inv-checkout-payments__head">
              <div>
                <h3 id="payment-methods-title">
                  {exitKind === "credit" ? "Abono inicial (opcional)" : "Métodos de pago"}
                </h3>
                <p>
                  {exitKind === "credit"
                    ? "Si el cliente abona una parte hoy, regístralo aquí. El saldo restante generará la Cuenta por Cobrar."
                    : netTotal === 0
                    ? "Factura totalmente bonificada/obsequio. No requiere registro de pago."
                    : "Divide el total entre uno o varios medios."}
                </p>
              </div>
              {netTotal > 0 && (
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  onClick={addPayment}
                  disabled={payments.length >= PAYMENT_METHODS.length}
                >
                  + Agregar método
                </button>
              )}
            </div>

            {netTotal === 0 ? (
              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "8px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span>🎁</span>
                <span>
                  <strong>Factura con 100% de descuento (Obsequio / Cortesía).</strong> Total a cobrar: $0.
                </span>
              </div>
            ) : (
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
            )}

            {exitKind === "credit" ? (
              <div
                className="inv-checkout-payments__balance is-complete"
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  borderColor: "rgba(99, 102, 241, 0.25)",
                }}
              >
                <span>Abono inicial hoy: <strong>{formatMoney(paidTotal)}</strong></span>
                <span>
                  Saldo a crédito (Por cobrar):{" "}
                  <strong style={{ color: "#ef4444" }}>
                    {formatMoney(Math.max(0, netTotal - paidTotal))}
                  </strong>
                </span>
              </div>
            ) : netTotal > 0 ? (
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
                {payments.length > 1 && Math.abs(paymentDifference) >= 0.01 && (
                  <button
                    type="button"
                    onClick={() => {
                      const last = payments[payments.length - 1];
                      const currentVal = Number(last.amount) || 0;
                      updatePayment(last.id, { amount: String(Math.max(0, currentVal + paymentDifference)) });
                    }}
                    style={{
                      marginLeft: "auto",
                      background: "transparent",
                      border: "none",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "inherit",
                    }}
                  >
                    Ajustar diferencia
                  </button>
                )}
              </div>
            ) : null}

            {payments.some(
              (p) => Number(p.amount) > 0 && p.method !== "efectivo" && p.method !== "saldo_a_favor"
            ) && (
              <ReceiptPhotosUploader
                files={receiptFiles}
                onChange={setReceiptFiles}
                disabled={confirming || uploadingReceipt}
                label="Comprobantes / Fotos de Soporte (No Efectivo)"
                hint="Toma una o varias fotos con la cámara o adjunta comprobantes para registrarlos en la venta y cierre de caja."
              />
            )}
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
          <button type="button" className="inv-btn inv-btn--ghost" disabled={confirming || uploadingReceipt} onClick={handleClose}>
            Cancelar
          </button>
          <button type="button" className="inv-btn inv-btn--primary" disabled={confirming || uploadingReceipt} onClick={submit}>
            {confirming || uploadingReceipt ? "Guardando…" : "Confirmar y generar comprobante"}
          </button>
        </div>
      </div>
    </div>
  );
}
