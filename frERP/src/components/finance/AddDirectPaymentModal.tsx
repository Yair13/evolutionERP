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
          setIsInitial(false);
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
        isInitial: canManageInitial ? isInitial : false,
        notes: notes.trim() || null,
        receiptUrl: uploadedUrl,
        receiptFilename: uploadedFilename,
        receiptUrls: uploadedUrls.length > 0 ? uploadedUrls : null,
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      if (err?.message === "Failed to fetch" || (err instanceof TypeError && err.message?.includes("fetch"))) {
        setError("Error de conexión con el servidor al registrar el abono. Verifica tu conexión a internet.");
      } else {
        setError(err?.message || "Error al registrar el abono sin factura.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedWarehouseName =
    warehouses.find((w) => w.id === selectedWarehouseId)?.name || "Esta sede";

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="inv-modal inv-modal--checkout"
        role="dialog"
        aria-labelledby="direct-payment-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 16,
          padding: "24px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: "#ecfdf5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Wallet size={22} />
            </div>
            <div>
              <h2
                id="direct-payment-title"
                style={{
                  margin: 0,
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                Registrar Abono sin Factura
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                Abono anticipado de dinero para saldo a favor del cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            style={{ width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Sede */}
          {isAllWarehouses && warehouses.length > 1 ? (
            <label className="field" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#334155" }}>
                Sede donde se recibe el abono *
              </span>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "0.84rem",
                color: "#475569",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Building2 size={16} color="#6366f1" />
              <span>
                Sede receptora: <strong style={{ color: "#0f172a" }}>{selectedWarehouseName}</strong>
              </span>
            </div>
          )}

          {/* Sección de Cliente */}
          <div
            style={{
              background: "#f8fafc",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#334155" }}>
                Cliente *
              </span>
            </div>

            {selectedCustomer ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#ffffff",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <User size={16} color="#6366f1" />
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                      {selectedCustomer.displayName}
                    </strong>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 2 }}>
                    CC / NIT: {selectedCustomer.taxId || "—"} · Tel: {selectedCustomer.phone || "—"}
                  </div>
                  {Number(selectedCustomer.creditBalance) > 0 && (
                    <div style={{ color: "#059669", fontSize: "0.82rem", fontWeight: 600, marginTop: 4 }}>
                      💰 Saldo a favor disponible: {formatMoney(Number(selectedCustomer.creditBalance))}
                    </div>
                  )}
                </div>

                {!defaultCustomerId && (
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                      setCustomerList([]);
                    }}
                    disabled={submitting}
                    style={{ fontSize: "0.8rem", padding: "4px 10px", height: "auto" }}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre, cédula o teléfono..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />

                {searching && (
                  <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginTop: 4 }}>
                    Buscando clientes...
                  </span>
                )}

                {customerList.length > 0 && (
                  <ul
                    style={{
                      maxHeight: 180,
                      overflowY: "auto",
                      margin: "8px 0 0",
                      listStyle: "none",
                      padding: 0,
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      background: "#ffffff",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    {customerList.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch("");
                          setCustomerList([]);
                        }}
                        style={{
                          cursor: "pointer",
                          padding: "9px 12px",
                          borderBottom: "1px solid #f1f5f9",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          color: "#0f172a",
                          fontSize: "0.88rem",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                      >
                        <div>
                          <strong>{c.displayName}</strong>
                          <span style={{ color: "#64748b", marginLeft: 6, fontSize: "0.8rem" }}>
                            ({c.taxId || "Sin CC"})
                          </span>
                        </div>
                        {c.creditBalance != null && c.creditBalance > 0 && (
                          <span style={{ color: "#059669", fontSize: "0.8rem", fontWeight: 600 }}>
                            A favor: {formatMoney(c.creditBalance)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Valor a abonar y Método de pago */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label className="field" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#334155" }}>
                Valor a abonar (COP) *
              </span>
              <input
                type="number"
                min="1"
                step="any"
                placeholder="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
              {amount > 0 && (
                <span style={{ fontSize: "0.82rem", color: "#059669", fontWeight: 700 }}>
                  {formatMoney(amount)}
                </span>
              )}
            </label>

            <label className="field" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#334155" }}>
                Medio de pago *
              </span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                  minHeight: 42,
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* CONTROL DE SALDO INICIAL O AVISO DE RECAUDO EN CAJA */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: isInitial ? "#fffbeb" : "#f0fdf4",
              border: `1px solid ${isInitial ? "#fcd34d" : "#bbf7d0"}`,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            {canManageInitial ? (
              <>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: hasInitialAlready ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    color: isInitial ? "#92400e" : "#166534",
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
                  <div style={{ fontSize: "0.8rem", color: "#b91c1c", display: "flex", alignItems: "center", gap: 5 }}>
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span>Este cliente ya tiene registrado un saldo inicial en esta sede (solo se permite 1 inicial). Se registrará como abono normal de hoy.</span>
                  </div>
                )}

                {!hasInitialAlready && isInitial && (
                  <div style={{ fontSize: "0.8rem", color: "#92400e", display: "flex", alignItems: "center", gap: 5 }}>
                    <Info size={15} style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Atención:</strong> Al ser saldo inicial, este valor <strong>NO sumará a la caja ni al recaudo de hoy</strong>. Solo se registrará como saldo a favor del cliente.
                    </span>
                  </div>
                )}

                {!isInitial && (
                  <div style={{ fontSize: "0.8rem", color: "#166534", display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                    <span>
                      El dinero ingresará a la <strong>caja / recaudos de hoy</strong> en esta sede ({method}) y sumará de inmediato al <strong>saldo a favor</strong> del cliente para cuando reclame productos.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: "0.84rem", color: "#166534", display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
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
          <label className="field" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#334155" }}>
              Notas / Concepto (opcional)
            </span>
            <textarea
              rows={2}
              placeholder="Ej: Abono anticipado para separar o reclamar productos más adelante..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontSize: "0.88rem",
                boxSizing: "border-box",
                resize: "none",
                fontFamily: "inherit",
              }}
            />
          </label>

          {/* Acciones */}
          <div
            className="inv-modal__actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              borderTop: "1px solid #e2e8f0",
              paddingTop: "14px",
              marginTop: "4px",
            }}
          >
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
              disabled={submitting || amount <= 0 || !selectedCustomer}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#059669",
                color: "#ffffff",
                padding: "9px 18px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: "0.92rem",
                cursor: (submitting || amount <= 0 || !selectedCustomer) ? "not-allowed" : "pointer",
                opacity: (submitting || amount <= 0 || !selectedCustomer) ? 0.6 : 1,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{submitting ? "Guardando..." : "Guardar Abono"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
