import { useState, useEffect } from "react";
import { getTodayBogotaYmd } from "../../lib/dateUtils.js";
import { createPayable, fetchSuppliers, type SupplierItem } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { FileText, X, PlusCircle, Building2 } from "lucide-react";
import { CreateSupplierModal } from "./CreateSupplierModal.js";

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
  { value: "saldo_a_favor", label: "Saldo a Favor Proveedor 💰" },
] as const;

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CreatePayableModal({ open, onClose, onSuccess }: Props) {
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
  const [billNumber, setBillNumber] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [totalAmountStr, setTotalAmountStr] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(getTodayBogotaYmd());
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Abono inicial
  const [initialPaymentStr, setInitialPaymentStr] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo");

  // Proveedores
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierList, setSupplierList] = useState<SupplierItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierItem | null>(null);
  const [openCreateSupplier, setOpenCreateSupplier] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedWarehouseId(warehouseId || (warehouses[0]?.id ?? ""));
      setBillNumber("");
      setDescription("");
      setTotalAmountStr("");
      setIssueDate(getTodayBogotaYmd());
      setDueDate("");
      setNotes("");
      setInitialPaymentStr("");
      setPaymentMethod("efectivo");
      setSearchQuery("");
      setSupplierList([]);
      setSelectedSupplier(null);
      setError(null);
    }
  }, [open, warehouseId, warehouses]);

  // Búsqueda de proveedores
  useEffect(() => {
    if (!open || !token || !searchQuery.trim()) {
      setSupplierList([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchSuppliers(token, { q: searchQuery.trim(), activeOnly: true, limit: 10 });
        setSupplierList(res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQuery, token, open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!selectedWarehouseId) {
      setError("Selecciona la sede o bodega de la deuda.");
      return;
    }

    if (!selectedSupplier) {
      setError("Debes seleccionar un proveedor.");
      return;
    }

    const totalAmount = Number(totalAmountStr) || 0;
    if (totalAmount <= 0) {
      setError("El valor total de la deuda debe ser mayor a $0.");
      return;
    }

    const initialPayment = Number(initialPaymentStr) || 0;
    if (initialPayment < 0) {
      setError("El abono inicial no puede ser negativo.");
      return;
    }

    if (initialPayment > 0 && paymentMethod === "saldo_a_favor") {
      const avail = selectedSupplier.creditBalance || 0;
      if (initialPayment > avail) {
        setError(`El saldo a favor disponible con este proveedor es de ${formatMoney(avail)}.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      await createPayable(token, {
        supplierId: selectedSupplier.id,
        warehouseId: selectedWarehouseId,
        totalAmount,
        billNumber: billNumber.trim() || null,
        description: description.trim() || null,
        issueDate: issueDate || null,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
        initialPayment,
        paymentMethod: initialPayment > 0 ? paymentMethod : undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.message === "insufficient_credit_balance") {
        setError("El saldo a favor con el proveedor es insuficiente.");
      } else {
        setError(err instanceof Error ? err.message : "Error al registrar la cuenta por pagar.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const initialNum = Number(initialPaymentStr) || 0;
  const totalNum = Number(totalAmountStr) || 0;
  const remaining = Math.max(0, totalNum - initialNum);

  return (
    <>
      <div className="inv-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
        <div
          className="inv-modal"
          role="dialog"
          aria-labelledby="create-payable-title"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto", overflowX: "hidden" }}
        >
          <div className="inv-modal__header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FileText size={20} color="#f59e0b" />
              <h2 id="create-payable-title" className="inv-modal__title">
                Registrar Cuenta por Pagar / Factura de Proveedor
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

            {/* Sede / Bodega */}
            <label className="field">
              <span>Sede / Bodega receptora *</span>
              {isAllWarehouses ? (
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  disabled={submitting}
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code}) {w.is_factory ? "— Fábrica/Bodega" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-elevated)", fontWeight: 600, fontSize: "0.9rem" }}>
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
                </div>
              )}
            </label>

            {/* Selector de Proveedor */}
            <div style={{ background: "var(--inv-bg-elevated)", padding: "0.85rem", borderRadius: 8, border: "1px solid var(--inv-border)" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-muted)" }}>Proveedor *</span>

              {selectedSupplier ? (
                <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--inv-bg-field)", padding: "0.75rem", borderRadius: 6 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Building2 size={16} color="#6366f1" />
                      <strong>{selectedSupplier.name}</strong>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--inv-text-muted)" }}>
                      NIT: {selectedSupplier.taxId || "—"} · Tel: {selectedSupplier.phone || "—"}
                    </div>
                    {selectedSupplier.creditBalance > 0 && (
                      <div style={{ color: "#10b981", fontSize: "0.82rem", fontWeight: 600, marginTop: "0.2rem" }}>
                        💰 Saldo a favor disponible de nuestra empresa: {formatMoney(selectedSupplier.creditBalance)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    onClick={() => setSelectedSupplier(null)}
                    style={{ fontSize: "0.8rem" }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: "0.5rem" }}>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar proveedor por nombre o NIT..."
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)" }}
                  />
                  {searching && <span style={{ fontSize: "0.75rem", color: "var(--inv-text-muted)" }}>Buscando...</span>}
                  {supplierList.length > 0 && (
                    <ul className="inv-checkout-customer__list" style={{ maxHeight: 160, overflowY: "auto", margin: "0.5rem 0" }}>
                      {supplierList.map((s) => (
                        <li
                          key={s.id}
                          onClick={() => {
                            setSelectedSupplier(s);
                            setSearchQuery("");
                            setSupplierList([]);
                          }}
                          className="inv-customer-item"
                          style={{ cursor: "pointer", padding: "6px 8px" }}
                        >
                          <strong>{s.name}</strong> - NIT: {s.taxId || "—"} - Tel: {s.phone || "—"}
                          {s.creditBalance > 0 && (
                            <span style={{ color: "#10b981", marginLeft: "0.5rem", fontSize: "0.78rem" }}>
                              (Saldo a favor: {formatMoney(s.creditBalance)})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setOpenCreateSupplier(true)}
                      className="inv-btn inv-btn--ghost"
                      style={{ fontSize: "0.8rem", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <PlusCircle size={14} />
                      Crear nuevo proveedor
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Factura y Concepto */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
              <label className="field" style={{ minWidth: 0 }}>
                <span>N° Factura / Remisión</span>
                <input
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="Ej: FE-12345"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label className="field" style={{ minWidth: 0 }}>
                <span>Concepto / Descripción *</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Compra de materia prima / rollos tela"
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>
            </div>

            {/* Fechas y Monto Total */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
              <label className="field" style={{ minWidth: 0 }}>
                <span>Valor Total Deuda *</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={totalAmountStr}
                  onChange={(e) => setTotalAmountStr(e.target.value)}
                  placeholder="$ 0"
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label className="field" style={{ minWidth: 0 }}>
                <span>Fecha Factura</span>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label className="field" style={{ minWidth: 0 }}>
                <span>Fecha Vencimiento</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>
            </div>

            {/* Abono Inicial / Salida Inmediata de Dinero */}
            <div style={{ padding: "0.85rem", background: "rgba(245, 158, 11, 0.05)", border: "1px dashed rgba(245, 158, 11, 0.3)", borderRadius: 8 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f59e0b" }}>
                Abono o Pago Inmediato (Opcional - Salida de Caja)
              </span>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginTop: "0.5rem" }}>
                <label className="field" style={{ minWidth: 0 }}>
                  <span>Monto Pagado</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={initialPaymentStr}
                    onChange={(e) => setInitialPaymentStr(e.target.value)}
                    placeholder="$ 0"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </label>

                <label className="field" style={{ minWidth: 0 }}>
                  <span>Medio de Pago</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    disabled={initialNum <= 0}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {totalNum > 0 && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.82rem", display: "flex", justifyContent: "space-between" }}>
                  <span>Pagado hoy: <strong style={{ color: "#10b981" }}>{formatMoney(initialNum)}</strong></span>
                  <span>Saldo por pagar: <strong style={{ color: "#f59e0b" }}>{formatMoney(remaining)}</strong></span>
                </div>
              )}
            </div>

            <label className="field">
              <span>Notas adicionales</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones de la compra..."
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
                {submitting ? "Guardando..." : "Registrar Cuenta por Pagar"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CreateSupplierModal
        open={openCreateSupplier}
        onClose={() => setOpenCreateSupplier(false)}
        onSuccess={(supplier) => {
          setSelectedSupplier(supplier);
        }}
      />
    </>
  );
}
