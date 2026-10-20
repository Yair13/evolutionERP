import { useState, useEffect } from "react";
import {
  createCashOutflow,
  uploadClosureReceiptFiles,
  fetchSuppliers,
  fetchPayables,
  type CashOutflowItem,
  type SupplierItem,
  type PayableSummaryItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { FileMinus, X, AlertCircle, Check, Loader2, Building2 } from "lucide-react";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (outflow: CashOutflowItem) => void;
};

const BANK_PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo 💵" },
  { value: "bancolombia", label: "Bancolombia 🟡" },
  { value: "davivienda", label: "Davivienda 🔴" },
  { value: "nequi", label: "Nequi 🟣" },
  { value: "daviplata", label: "Daviplata 🔴" },
  { value: "bold", label: "Bold 🔵" },
] as const;

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CreateEgressVoucherModal({ open, onClose, onSuccess }: Props) {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || ""));
    }
  }, [open, isAllWarehouses, warehouseId, warehouses]);
  const [concept, setConcept] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");

  // Opciones de Proveedor y Enlace a Cuenta por Pagar
  const [isSupplierPayment, setIsSupplierPayment] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierList, setSupplierList] = useState<SupplierItem[]>([]);
  const [searchingSuppliers, setSearchingSuppliers] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierItem | null>(null);
  const [payablesList, setPayablesList] = useState<PayableSummaryItem[]>([]);
  const [loadingPayables, setLoadingPayables] = useState(false);
  const [selectedPayableId, setSelectedPayableId] = useState("");

  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // REGLA GENERAL: solo la Sede Administrativa puede pagar con cuentas; las sedes físicas solo en efectivo
  const currentWh = warehouses.find((w) => w.id === selectedWarehouseId);
  const isMainWarehouse = isAllWarehouses;

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(warehouseId || (warehouses[0]?.id ?? ""));
      setConcept("");
      setBeneficiaryName("");
      setAmountStr("");
      setPaymentMethod("efectivo");
      setNotes("");
      setReceiptFiles([]);
      setIsSupplierPayment(false);
      setSupplierSearch("");
      setSupplierList([]);
      setSelectedSupplier(null);
      setPayablesList([]);
      setSelectedPayableId("");
      setError(null);
    }
  }, [open, warehouseId, warehouses]);

  // Búsqueda de proveedores
  useEffect(() => {
    if (!token || !supplierSearch.trim() || selectedSupplier) {
      setSupplierList([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchingSuppliers(true);
      try {
        const res = await fetchSuppliers(token, { q: supplierSearch.trim(), activeOnly: true, limit: 10 });
        setSupplierList(res.items);
      } catch {
        setSupplierList([]);
      } finally {
        setSearchingSuppliers(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [token, supplierSearch, selectedSupplier]);

  // Carga de facturas / cuentas por pagar pendientes del proveedor seleccionado
  useEffect(() => {
    if (!token || !selectedSupplier) {
      setPayablesList([]);
      return;
    }
    let cancelled = false;
    setLoadingPayables(true);
    fetchPayables(token, { supplierId: selectedSupplier.id, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        const openBills = res.items.filter((p) => p.status === "open" || p.status === "partial");
        setPayablesList(openBills);
      })
      .catch((err) => {
        console.error("Error al cargar cuentas por pagar del proveedor:", err);
        if (!cancelled) setPayablesList([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPayables(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedSupplier]);

  // Si cambia a una sede que no es la principal, forzar a efectivo
  useEffect(() => {
    if (!isMainWarehouse && paymentMethod !== "efectivo") {
      setPaymentMethod("efectivo");
    }
  }, [isMainWarehouse, paymentMethod]);

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

    if (!selectedWarehouseId) {
      setError("Selecciona la sede de donde sale el dinero.");
      return;
    }

    if (!concept.trim()) {
      setError("Indica el concepto o motivo del egreso.");
      return;
    }

    if (!beneficiaryName.trim()) {
      setError("Indica el nombre de la persona que recibe el dinero.");
      return;
    }

    const amount = Number(amountStr) || 0;
    if (amount <= 0) {
      setError("El valor del egreso debe ser mayor a $0.");
      return;
    }

    if (!isMainWarehouse && paymentMethod !== "efectivo") {
      setError("Las sedes físicas solo pueden sacar dinero en Efectivo. Los pagos por cuentas se hacen desde la Sede Administrativa.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedReceiptUrl: string | null = null;
      let uploadedReceiptUrls: string[] = [];
      let uploadedReceiptFilename: string | null = null;

      if (receiptFiles.length > 0) {
        try {
          const uploads = await uploadClosureReceiptFiles(token, receiptFiles);
          uploadedReceiptUrls = uploads.map((u) => u.url);
          uploadedReceiptUrl = uploadedReceiptUrls[0] || null;
          uploadedReceiptFilename = uploads[0]?.filename || null;
        } catch (uploadErr) {
          console.error("Error al subir comprobantes de egreso:", uploadErr);
          setError("No se pudieron subir las fotos del soporte. Por favor reintenta.");
          setSubmitting(false);
          return;
        }
      }

      const res = await createCashOutflow(token, {
        warehouseId: selectedWarehouseId,
        concept: concept.trim(),
        beneficiaryName: beneficiaryName.trim(),
        beneficiaryDoc: null,
        amount,
        paymentMethod,
        supplierId: isSupplierPayment && selectedSupplier ? selectedSupplier.id : null,
        payableId: isSupplierPayment && selectedPayableId ? selectedPayableId : null,
        referenceCode: null,
        notes: notes.trim() || null,
        receiptUrl: uploadedReceiptUrl,
        receiptUrls: uploadedReceiptUrls,
        receiptFilename: uploadedReceiptFilename,
      });

      onSuccess(res.item);
      onClose();
    } catch (err: any) {
      if (err.message === "physical_site_cash_only") {
        setError("Las sedes físicas solo pueden sacar dinero en Efectivo. Los pagos por cuentas se hacen desde la Sede Administrativa.");
      } else {
        setError(err instanceof Error ? err.message : "Error al registrar el egreso.");
      }
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
        aria-labelledby="create-egress-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
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
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FileMinus size={22} />
            </div>
            <div>
              <h2
                id="create-egress-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                Comprobante de Egreso
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                Registra salidas de dinero en efectivo o transferencias bancarias
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

        {/* Modal Body Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
            padding: "22px 24px",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {error && <div className="inv-form-error">{error}</div>}

          {/* Sede de origen del dinero */}
          <label className="field">
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Sede de donde sale el dinero *
            </span>
            {isAllWarehouses ? (
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={submitting}
                required
                style={{ width: "100%" }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code}) {w.is_factory ? "— Fábrica / Bodega Principal" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  background: "#f8fafc",
                  fontWeight: 600,
                  fontSize: "0.92rem",
                  color: "#0f172a",
                }}
              >
                {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
              </div>
            )}
          </label>

          {/* Advertencia / Regla de salida bancaria */}
          {!isMainWarehouse ? (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.28)",
                borderRadius: 10,
                fontSize: "0.84rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                color: "#b45309",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>
                <strong>Sede física:</strong> Las salidas de dinero se realizan exclusivamente en <strong>Efectivo</strong> de la caja de la sede. Los pagos por cuentas bancarias solo se hacen desde la Sede Administrativa.
              </span>
            </div>
          ) : (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.24)",
                borderRadius: 10,
                fontSize: "0.84rem",
                color: "#4338ca",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
              }}
            >
              <span style={{ fontSize: "1.15rem", flexShrink: 0 }}>🏢</span>
              <span>
                <strong>Sede Administrativa:</strong> Autorizada para egresos en efectivo y pagos por cuentas bancarias.
              </span>
            </div>
          )}

          {/* Selector de Tipo de Egreso: General o Proveedor */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Destino o Tipo de Egreso *
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={() => {
                  setIsSupplierPayment(false);
                  setSelectedSupplier(null);
                  setSelectedPayableId("");
                  setPayablesList([]);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  padding: "10px",
                  borderRadius: "8px",
                  border: !isSupplierPayment ? "2px solid #0f766e" : "1px solid #cbd5e1",
                  background: !isSupplierPayment ? "rgba(15, 118, 110, 0.08)" : "#ffffff",
                  color: !isSupplierPayment ? "#0f766e" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📦</span> Gasto Operativo / General
              </button>
              <button
                type="button"
                onClick={() => setIsSupplierPayment(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  padding: "10px",
                  borderRadius: "8px",
                  border: isSupplierPayment ? "2px solid #6366f1" : "1px solid #cbd5e1",
                  background: isSupplierPayment ? "rgba(99, 102, 241, 0.08)" : "#ffffff",
                  color: isSupplierPayment ? "#4f46e5" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <Building2 size={16} /> Pago a Proveedor
              </button>
            </div>
          </div>

          {/* Bloque para asociar Proveedor y Factura / Cuenta por Pagar */}
          {isSupplierPayment && (
            <div
              style={{
                padding: "0.95rem",
                borderRadius: "10px",
                border: "1px solid rgba(99, 102, 241, 0.28)",
                background: "rgba(99, 102, 241, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#4338ca", display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={16} /> Proveedor y Factura Asociada
              </span>

              {selectedSupplier ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#ffffff",
                    padding: "0.75rem 0.9rem",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Building2 size={16} color="#6366f1" />
                      <strong>{selectedSupplier.name}</strong>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      NIT: {selectedSupplier.taxId || "—"} · Tel: {selectedSupplier.phone || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    onClick={() => {
                      setSelectedSupplier(null);
                      setSelectedPayableId("");
                      setPayablesList([]);
                    }}
                    style={{ fontSize: "0.8rem", padding: "4px 8px" }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor por nombre o NIT..."
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                  {searchingSuppliers && (
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4, display: "block" }}>
                      Buscando proveedores...
                    </span>
                  )}
                  {supplierList.length > 0 && (
                    <ul
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                        maxHeight: "180px",
                        overflowY: "auto",
                        listStyle: "none",
                        padding: "4px 0",
                        margin: "4px 0 0",
                      }}
                    >
                      {supplierList.map((s) => (
                        <li
                          key={s.id}
                          onClick={() => {
                            setSelectedSupplier(s);
                            setSupplierSearch("");
                            setSupplierList([]);
                            if (!beneficiaryName.trim()) {
                              setBeneficiaryName(s.name);
                            }
                            if (!concept.trim()) {
                              setConcept(`Pago a proveedor - ${s.name}`);
                            }
                          }}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <strong>{s.name}</strong> - NIT: {s.taxId || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Selector de cuenta por pagar pendiente */}
              {selectedSupplier && (
                <div>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>
                    Factura o Deuda a Abonar:
                  </span>
                  {loadingPayables ? (
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Cargando facturas pendientes...</span>
                  ) : payablesList.length > 0 ? (
                    <select
                      value={selectedPayableId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedPayableId(val);
                        if (val) {
                          const p = payablesList.find((item) => item.id === val);
                          if (p) {
                            setConcept(`Pago factura ${p.billNumber ? p.billNumber : "s/n"} - ${selectedSupplier.name}`);
                            if (!amountStr) {
                              setAmountStr(String(p.balanceAmount));
                            }
                          }
                        }
                      }}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    >
                      <option value="">Abono general al proveedor (Sin factura específica)</option>
                      {payablesList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.billNumber ? `Factura ${p.billNumber}` : "Cuenta"} · Saldo por pagar: {formatMoney(p.balanceAmount)} · {p.description || "Sin descripción"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontSize: "0.82rem", color: "#64748b", padding: "6px 8px", background: "#f8fafc", borderRadius: 6 }}>
                      Este proveedor no tiene facturas pendientes con saldo. El egreso se registrará como abono libre al proveedor.
                    </div>
                  )}

                  {selectedPayableId && (
                    <div style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#10b981", fontWeight: 600 }}>
                      ✓ Este egreso descontará automáticamente el valor de la cuenta por pagar en Sede Administrativa.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Beneficiario / Quien recibe */}
          <label className="field">
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Persona a quien se entrega el dinero (Beneficiario) *
            </span>
            <input
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Ej: Pedro Martínez / Mensajero"
              required
            />
          </label>

          {/* Concepto y Monto */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Concepto / Motivo de la salida *
              </span>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej: Compra de insumos de aseo / Viáticos"
                required
              />
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Valor Salida *
              </span>
              <input
                type="number"
                min="1"
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="$ 0"
                required
              />
            </label>
          </div>

          {/* Medio de pago y correlativo calculado */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "0.85rem" }}>
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                Medio de Pago / Cuenta *
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={!isMainWarehouse}
              >
                {isMainWarehouse ? (
                  BANK_PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))
                ) : (
                  <option value="efectivo">Efectivo 💵 (Caja Menor)</option>
                )}
              </select>
            </label>

            <label className="field">
              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
                N° de Comprobante
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "42px",
                  padding: "0 12px",
                  background: "#f1f5f9",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 8,
                  fontSize: "0.86rem",
                  color: "#475569",
                  fontWeight: 500,
                  boxSizing: "border-box",
                }}
                title="El sistema genera automáticamente el consecutivo oficial del comprobante al registrar el egreso."
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#10b981",
                      flexShrink: 0,
                    }}
                  />
                  <strong style={{ color: "#0f172a" }}>Calculado por sistema</strong>
                  <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
                    (CE-{(currentWh?.code || "BOD").slice(0, 6).toUpperCase()}-#)
                  </span>
                </span>
              </div>
            </label>
          </div>

          <ReceiptPhotosUploader
            files={receiptFiles}
            onChange={setReceiptFiles}
            disabled={submitting}
            label="Fotos / Soporte del Egreso (Factura, recibo, transferencia)"
            helperText="Puedes tomar fotos con la cámara o subir archivos (imágenes o PDF) del soporte de la salida de dinero."
          />

          <label className="field">
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155" }}>
              Notas u Observaciones
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles adicionales del egreso..."
              style={{ resize: "vertical", minHeight: 60 }}
            />
          </label>

          {/* Modal Footer Actions */}
          <div
            style={{
              paddingTop: "0.5rem",
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
                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                borderColor: "#047857",
                color: "#ffffff",
                boxShadow: "0 2px 8px rgba(5, 150, 105, 0.28)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Emitir Comprobante de Egreso</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
