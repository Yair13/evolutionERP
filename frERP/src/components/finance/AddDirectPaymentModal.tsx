import { useState, useEffect } from "react";
import {
  addDirectCustomerPayment,
  checkCustomerHasInitial,
  uploadClosureReceiptFiles,
} from "../../api/finance.js";
import { fetchCustomers, type Customer } from "../../api/inventory.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { Wallet, X, CheckCircle2, AlertCircle, Building2, User, Info } from "lucide-react";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (updatedData?: any) => void;
  defaultWarehouseId?: string;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
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
] as const;

function formatMoney(n: number): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
}

export function AddDirectPaymentModal({
  open,
  onClose,
  onSuccess,
  defaultWarehouseId,
  defaultCustomerId,
  defaultCustomerName,
}: Props) {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses, canViewAllWarehouses } = useWarehouse();
  const isSuperAdmin = user?.roles.includes("super_admin") ?? false;
  const canManageInitial = isAllWarehouses || isSuperAdmin || canViewAllWarehouses;

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    if (!isAllWarehouses) return warehouseId || "";
    return defaultWarehouseId || warehouseId || (warehouses[0]?.id || "");
  });

  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searching, setSearching] = useState<boolean>(false);

  const [amountStr, setAmountStr] = useState<string>("");
  const [method, setMethod] = useState<string>("efectivo");
  const [isInitial, setIsInitial] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);

  const [hasInitialAlready, setHasInitialAlready] = useState<boolean>(false);
  const [checkingInitial, setCheckingInitial] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar estado al abrir el modal
  useEffect(() => {
    if (open) {
      const wh = !isAllWarehouses
        ? (warehouseId || "")
        : (defaultWarehouseId || warehouseId || (warehouses[0]?.id || ""));
      setSelectedWarehouseId(wh);
      setAmountStr("");
      setMethod("efectivo");
      setIsInitial(false);
      setNotes("");
      setReceiptFiles([]);
      setError(null);
      setHasInitialAlready(false);

      if (defaultCustomerId) {
        setSelectedCustomer({
          id: defaultCustomerId,
          displayName: defaultCustomerName || "Cliente seleccionado",
        } as Customer);
        setCustomerSearch("");
        setCustomerList([]);
      } else {
        setSelectedCustomer(null);
        setCustomerSearch("");
        setCustomerList([]);
      }
    }
  }, [open, isAllWarehouses, warehouseId, defaultWarehouseId, defaultCustomerId, defaultCustomerName, warehouses]);

  // Búsqueda en vivo de clientes
  useEffect(() => {
    if (!open || !token || selectedCustomer) return;
    const q = customerSearch.trim();
    if (q.length < 2) {
      setCustomerList([]);
      return;
    }

    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchCustomers(token, q, selectedWarehouseId || undefined);
        setCustomerList(res.items || []);
      } catch (err) {
        console.error("Error buscando clientes:", err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [open, token, customerSearch, selectedCustomer, selectedWarehouseId]);

  // Verificar si el cliente seleccionado ya cuenta con un inicial en la sede
  useEffect(() => {
    if (!open || !token || !selectedCustomer?.id || !selectedWarehouseId) {
      setHasInitialAlready(false);
      return;
    }

    let active = true;
    setCheckingInitial(true);
    checkCustomerHasInitial(token, selectedCustomer.id, selectedWarehouseId)
      .then((res) => {
        if (!active) return;
        setHasInitialAlready(res.hasInitial);
        if (res.hasInitial) {
          setIsInitial(false); // No se puede marcar inicial si ya tiene
        }
      })
      .catch((err) => {
        console.error("Error al consultar inicial:", err);
      })
      .finally(() => {
        if (active) setCheckingInitial(false);
      });

    return () => {
      active = false;
    };
  }, [open, token, selectedCustomer?.id, selectedWarehouseId]);

  if (!open) return null;

  const rawParsed = Number(String(amountStr).replace(",", "."));
  const amount = Number.isFinite(rawParsed) ? Math.round(rawParsed * 100) / 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!selectedWarehouseId) {
      setError("Debes seleccionar una sede válida.");
      return;
    }

    if (!selectedCustomer) {
      setError("Debes seleccionar un cliente para registrar el abono.");
      return;
    }

    if (amount <= 0) {
      setError("Indica un valor a abonar mayor a $0.");
      return;
    }

    if (isInitial && hasInitialAlready) {
      setError("Este cliente ya cuenta con un registro inicial en esta sede. Solo se permite un inicial por cliente.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedUrl: string | null = null;
      let uploadedUrls: string[] = [];
      let uploadedFilename: string | null = null;

      if (receiptFiles.length > 0) {
        const upRes = await uploadClosureReceiptFiles(token, receiptFiles);
        if (upRes.length > 0) {
          uploadedUrl = upRes[0]?.publicUrl || null;
          uploadedFilename = upRes[0]?.filename || null;
          uploadedUrls = upRes.map((u) => u.publicUrl);
        }
      }

      const res = await addDirectCustomerPayment(token, {
        warehouseId: selectedWarehouseId,
        customerId: selectedCustomer.id,
        paymentMethod: method,
        amount,
        isInitial,
        notes: notes.trim() || null,
        receiptUrl: uploadedUrl,
        receiptFilename: uploadedFilename,
        receiptUrls: uploadedUrls.length > 0 ? uploadedUrls : null,
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error al registrar el abono sin factura.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="direct-payment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "600px" }}
      >
        <div className="inv-modal__header" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Wallet size={20} />
            </div>
            <div>
              <h2 id="direct-payment-title" className="inv-modal__title" style={{ margin: 0, fontSize: "1.15rem" }}>
                Registrar Abono sin Factura
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Abono anticipado de dinero para saldo a favor del cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inv-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {error && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#ef4444",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Sede */}
          {isAllWarehouses && warehouses.length > 1 ? (
            <div className="inv-form-group">
              <label className="inv-form-label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Building2 size={15} style={{ color: "var(--text-muted)" }} />
                <span>Sede donde se recibe el abono *</span>
              </label>
              <select
                className="inv-input"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={submitting}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              style={{
                padding: "0.55rem 0.85rem",
                borderRadius: "6px",
                background: "var(--surface-color)",
                border: "1px solid var(--border-color)",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
              }}
            >
              Sede receptora: <strong>{warehouses.find((w) => w.id === selectedWarehouseId)?.name || "Esta sede"}</strong>
            </div>
          )}

          {/* Cliente */}
          <div className="inv-form-group">
            <label className="inv-form-label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <User size={15} style={{ color: "var(--text-muted)" }} />
              <span>Cliente *</span>
            </label>
            {selectedCustomer ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6rem 0.85rem",
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  borderRadius: "8px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {selectedCustomer.displayName}
                  </div>
                  {selectedCustomer.taxId && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      CC/NIT: {selectedCustomer.taxId}
                    </div>
                  )}
                </div>
                {!defaultCustomerId && (
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                      setHasInitialAlready(false);
                    }}
                    disabled={submitting}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  className="inv-input"
                  placeholder="Buscar por nombre, cédula o teléfono..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
                {searching && (
                  <span
                    style={{
                      position: "absolute",
                      right: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Buscando...
                  </span>
                )}
                {customerList.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "var(--surface-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      marginTop: "4px",
                      maxHeight: "180px",
                      overflowY: "auto",
                      zIndex: 30,
                      boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
                    }}
                  >
                    {customerList.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch("");
                          setCustomerList([]);
                        }}
                        style={{
                          padding: "0.55rem 0.85rem",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-color)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.85rem",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99, 102, 241, 0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div>
                          <strong>{c.displayName}</strong>
                          {c.taxId && <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>({c.taxId})</span>}
                        </div>
                        {c.creditBalance != null && c.creditBalance > 0 && (
                          <span style={{ color: "#10b981", fontSize: "0.8rem", fontWeight: 600 }}>
                            A favor: {formatMoney(c.creditBalance)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Valor a abonar y Método de pago */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="inv-form-group">
              <label className="inv-form-label">Valor a abonar (COP) *</label>
              <input
                type="number"
                min="1"
                step="any"
                className="inv-input"
                placeholder="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={submitting}
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              />
              {amount > 0 && (
                <div style={{ fontSize: "0.78rem", color: "#10b981", marginTop: "2px", fontWeight: 600 }}>
                  {formatMoney(amount)}
                </div>
              )}
            </div>

            <div className="inv-form-group">
              <label className="inv-form-label">Medio de pago *</label>
              <select
                className="inv-input"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={submitting}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CONTROL DE SALDO INICIAL (SOLO ADMINISTRADOR) O ABONO DE SEDE */}
          <div
            style={{
              padding: "0.75rem 0.9rem",
              borderRadius: "8px",
              background: isInitial ? "rgba(245, 158, 11, 0.08)" : "rgba(16, 185, 129, 0.06)",
              border: `1px solid ${isInitial ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.2)"}`,
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {canManageInitial ? (
              <>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    cursor: hasInitialAlready ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "0.87rem",
                    color: isInitial ? "#d97706" : "var(--text-primary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isInitial}
                    onChange={(e) => setIsInitial(e.target.checked)}
                    disabled={submitting || hasInitialAlready || checkingInitial}
                    style={{ width: 17, height: 17, cursor: hasInitialAlready ? "not-allowed" : "pointer" }}
                  />
                  <span>Es Saldo Inicial previo (Apertura / Migración de sistema anterior)</span>
                </label>

                {hasInitialAlready && (
                  <div style={{ fontSize: "0.78rem", color: "#ef4444", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <AlertCircle size={14} />
                    <span>Este cliente ya tiene registrado un saldo inicial en esta sede (solo se permite 1 inicial). Se registrará como abono normal de hoy.</span>
                  </div>
                )}

                {!hasInitialAlready && isInitial && (
                  <div style={{ fontSize: "0.78rem", color: "#d97706", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Info size={14} />
                    <span>
                      <strong>Atención:</strong> Al ser saldo inicial, este valor <strong>NO sumará a la caja ni al recaudo de hoy</strong>. Solo se registrará como saldo a favor disponible del cliente.
                    </span>
                  </div>
                )}

                {!isInitial && (
                  <div style={{ fontSize: "0.78rem", color: "#059669", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CheckCircle2 size={14} />
                    <span>
                      El dinero ingresará a la <strong>caja / recaudos de hoy</strong> en esta sede ({method}) y sumará de inmediato al <strong>saldo a favor</strong> del cliente para cuando reclame productos.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: "0.82rem", color: "#059669", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <CheckCircle2 size={16} />
                <span>
                  <strong>Abono de sede física:</strong> El dinero entra a la caja/bancos de hoy ({method}) de esta sede y se acredita como saldo a favor disponible del cliente.
                </span>
              </div>
            )}
          </div>

          {/* Comprobantes fotográficos */}
          <ReceiptPhotosUploader
            files={receiptFiles}
            onChange={setReceiptFiles}
            label="Comprobantes / Soporte Fotográfico"
            hint="Opcional. Sube fotos o capturas de la consignación, transferencia o recibo firmado."
          />

          {/* Notas */}
          <div className="inv-form-group">
            <label className="inv-form-label">Notas / Concepto (opcional)</label>
            <textarea
              className="inv-input"
              rows={2}
              placeholder="Ej: Abono anticipado para separar o reclamar productos más adelante..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              style={{ resize: "none" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              borderTop: "1px solid var(--border-color)",
              paddingTop: "1rem",
              marginTop: "0.5rem",
            }}
          >
            <button
              type="button"
              className="fin-btn fin-btn--ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="fin-btn fin-btn--primary"
              disabled={submitting || amount <= 0 || !selectedCustomer}
              style={{ minWidth: "160px" }}
            >
              {submitting ? "Guardando..." : "Guardar Abono"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
