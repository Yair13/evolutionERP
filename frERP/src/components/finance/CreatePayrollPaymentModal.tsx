import { useState, useEffect } from "react";
import {
  DollarSign,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  createPayrollPayment,
  uploadClosureReceiptFiles,
  type EmployeeItem,
  type PayrollPaymentItem,
} from "../../api/finance.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { getTodayBogotaYmd } from "../../lib/dateUtils.js";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  return getTodayBogotaYmd();
}

type Props = {
  token: string;
  employees: EmployeeItem[];
  preselectedEmployeeId?: string;
  onClose: () => void;
  onSuccess: (payment: PayrollPaymentItem) => void;
};

export function CreatePayrollPaymentModal({
  token,
  employees,
  preselectedEmployeeId,
  onClose,
  onSuccess,
}: Props) {
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [employeeId, setEmployeeId] = useState(preselectedEmployeeId ?? (employees[0]?.id || ""));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );
  const [paymentDate, setPaymentDate] = useState(localTodayYmd);

  // Período (calculado con la hora y fecha de Colombia)
  const todayYmd = getTodayBogotaYmd();
  const [yearNum, monthNum, dayNum] = todayYmd.split("-").map(Number);
  const isSecondHalf = dayNum > 15;
  const defaultStart = `${yearNum}-${String(monthNum).padStart(2, "0")}-${isSecondHalf ? "16" : "01"}`;
  const lastDay = new Date(yearNum, monthNum, 0).getDate();
  const defaultEnd = `${yearNum}-${String(monthNum).padStart(2, "0")}-${isSecondHalf ? String(lastDay) : "15"}`;
  const monthName = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "long" }).format(new Date());
  const defaultConcept = `${isSecondHalf ? "2da Quincena" : "1ra Quincena"} ${monthName.toUpperCase()} ${yearNum}`;

  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [periodConcept, setPeriodConcept] = useState(defaultConcept);

  // Liquidación
  const [baseSalary, setBaseSalary] = useState("0");
  const [bonuses, setBonuses] = useState("0");
  const [deductions, setDeductions] = useState("0");

  // Método de pago
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [referenceCode, setReferenceCode] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al seleccionar colaborador, sugerir datos
  useEffect(() => {
    const emp = employees.find((e) => e.id === employeeId);
    if (emp) {
      // Si la periodicidad es quincenal y el sueldo base es mensual, o viceversa
      let initialSalary = emp.baseSalary;
      if (emp.paymentFrequency === "quincenal" && emp.baseSalary > 0) {
        // Por defecto colocamos la mitad si es quincenal o el salario registrado
        initialSalary = emp.baseSalary / 2;
      }
      setBaseSalary(String(initialSalary));

      if (emp.warehouseId) {
        setSelectedWarehouseId(emp.warehouseId);
      }

      // Sedes físicas: solo efectivo. La cuenta del empleado solo se usa desde la Sede Administrativa.
      if (isAllWarehouses && emp.bankName && emp.bankName.toLowerCase() !== "efectivo") {
        setPaymentMethod(emp.bankName.toLowerCase().includes("nequi") ? "nequi" : emp.bankName.toLowerCase().includes("davivienda") ? "davivienda" : "bancolombia");
      } else if (!isAllWarehouses) {
        setPaymentMethod("efectivo");
      }
    }
  }, [employeeId, employees, isAllWarehouses]);

  const numBase = parseFloat(baseSalary.replace(/[^0-9.]/g, "")) || 0;
  const numBonuses = parseFloat(bonuses.replace(/[^0-9.]/g, "")) || 0;
  const numDeductions = parseFloat(deductions.replace(/[^0-9.]/g, "")) || 0;
  const netAmount = Math.max(0, numBase + numBonuses - numDeductions);

  const isCash = paymentMethod === "efectivo";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) {
      setError("Debes seleccionar un colaborador.");
      return;
    }
    if (!selectedWarehouseId) {
      setError("Debes seleccionar la sede pagadora.");
      return;
    }
    if (!periodConcept.trim()) {
      setError("El concepto del período es obligatorio.");
      return;
    }
    if (netAmount <= 0) {
      setError("El valor neto a pagar debe ser mayor a 0.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let receiptUrl: string | null = null;
      let receiptUrls: string[] = [];
      let receiptFilename: string | null = null;

      // Si es transferencia y se adjuntaron fotos/archivos, subirlos primero
      if (!isCash && receiptFiles.length > 0) {
        try {
          const uploads = await uploadClosureReceiptFiles(token, receiptFiles);
          receiptUrls = uploads.map((u) => u.url);
          receiptUrl = receiptUrls[0] || null;
          receiptFilename = uploads[0]?.filename || null;
        } catch (uploadErr) {
          console.error("Error al subir soporte de nómina:", uploadErr);
          setError("No se pudieron subir las fotos del soporte. Por favor reintenta.");
          setSaving(false);
          return;
        }
      }

      const res = await createPayrollPayment(token, {
        employeeId,
        warehouseId: selectedWarehouseId,
        periodStart,
        periodEnd,
        periodConcept,
        baseSalary: numBase,
        bonuses: numBonuses,
        deductions: numDeductions,
        paymentMethod,
        paymentDate,
        transferReceiptUrl: receiptUrl,
        transferReceiptUrls: receiptUrls,
        transferReceiptFilename: receiptFilename,
        referenceCode: referenceCode.trim() || null,
        notes: notes.trim() || null,
      });

      onSuccess(res.item);
    } catch (err: any) {
      setError(err?.message || "Error al procesar el pago de nómina.");
    } finally {
      setSaving(false);
    }
  }

  const selectedEmp = employees.find((e) => e.id === employeeId);

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
          maxWidth: 680,
          width: "100%",
          padding: "1.75rem",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.2)",
          border: "1px solid var(--border-color)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", color: "#0f172a" }}>
              <DollarSign className="text-primary" />
              Registrar Pago de Nómina
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
              Genera el voucher de pago y descuenta de caja si es en efectivo o adjunta comprobante si es transferencia
            </p>
          </div>
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
          {/* Selección de Colaborador y Sede */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "0.75rem" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Colaborador / Empleado *</span>
              <select
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.position}) - {emp.code}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ margin: 0 }}>
              <span>Sede Pagadora *</span>
              {isAllWarehouses ? (
                <select
                  required
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
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
          </div>

          {/* Información del Colaborador */}
          {selectedEmp && (
            <div
              style={{
                padding: "0.6rem 0.85rem",
                background: "#f8fafc",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                fontSize: "0.8rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <strong>Doc:</strong> {selectedEmp.documentType} {selectedEmp.documentNumber} | <strong>Frecuencia:</strong> {selectedEmp.paymentFrequency}
              </div>
              {selectedEmp.bankName && (
                <div style={{ color: "#38bdf8" }}>
                  🏦 {selectedEmp.bankName} ({selectedEmp.bankAccountType ?? "Cta"} {selectedEmp.bankAccountNumber ?? "—"})
                </div>
              )}
            </div>
          )}

          {/* Período Liquidado */}
          <div
            style={{
              padding: "1rem",
              background: "#f8fafc",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 8 }}>
              Período y Fechas de Liquidación
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.5rem" }}>
              <label className="field" style={{ margin: 0 }}>
                <span>Concepto Período</span>
                <input
                  type="text"
                  required
                  value={periodConcept}
                  onChange={(e) => setPeriodConcept(e.target.value)}
                  placeholder="Ej. 1ra Quincena Octubre"
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>Desde</span>
                <input
                  type="date"
                  required
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>Hasta</span>
                <input
                  type="date"
                  required
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>Fecha Pago</span>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Desglose Salarial */}
          <div
            style={{
              padding: "1rem",
              background: "#f8fafc",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 8 }}>
              Cálculo de Liquidación Salarial
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem", alignItems: "end" }}>
              <label className="field" style={{ margin: 0 }}>
                <span>Sueldo Base ($ COP)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>(+) Bonos / Auxilios</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={bonuses}
                  onChange={(e) => setBonuses(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>(-) Deducciones / Préstamos</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={deductions}
                  onChange={(e) => setDeductions(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>

            {/* Total Neto a Pagar */}
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem 1rem",
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#10b981" }}>
                  Neto a Pagar
                </span>
                <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#ffffff" }}>
                  {formatMoney(netAmount)}
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "right" }}>
                Base: {formatMoney(numBase)} {numBonuses > 0 && `+ ${formatMoney(numBonuses)}`} {numDeductions > 0 && `- ${formatMoney(numDeductions)}`}
              </div>
            </div>
          </div>

          {/* Método de Pago y Soporte */}
          <div
            style={{
              padding: "0.85rem",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
              Método de Pago y Soporte
            </span>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <label className="field" style={{ margin: 0 }}>
                <span>Forma de Pago</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={!isAllWarehouses}>
                  <option value="efectivo">💵 Efectivo (Caja de Sede)</option>
                  {isAllWarehouses && (
                    <>
                      <option value="bancolombia">🟡 Bancolombia (Transferencia)</option>
                      <option value="davivienda">🔴 Davivienda (Transferencia)</option>
                      <option value="nequi">🟣 Nequi (Transferencia)</option>
                      <option value="daviplata">📱 Daviplata (Transferencia)</option>
                      <option value="bold">🔵 Bold</option>
                      <option value="transferencia">🏦 Otra Transferencia Bancaria</option>
                    </>
                  )}
                </select>
                {!isAllWarehouses && (
                  <small style={{ color: "#b45309", fontSize: "0.74rem" }}>
                    Sede física: nómina solo en efectivo. Pagos por cuenta desde la Sede Administrativa.
                  </small>
                )}
              </label>

              {!isCash && (
                <label className="field" style={{ margin: 0 }}>
                  <span>Referencia / N° Aprobación</span>
                  <input
                    type="text"
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    placeholder="Ej. REF-884920"
                  />
                </label>
              )}
            </div>

            {/* Alerta si es en efectivo */}
            {isCash ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  background: "var(--fin-amber-bg)",
                  border: "1px solid var(--fin-amber-border)",
                  borderRadius: 10,
                  fontSize: "0.82rem",
                  color: "#92400e",
                }}
              >
                <AlertTriangle size={20} className="shrink-0" style={{ marginTop: 2, color: "#d97706" }} />
                <div>
                  <strong>Descuento automático de caja:</strong> Como el pago es en <strong>Efectivo</strong>, este valor se descontará automáticamente del <strong>cierre y arqueo de caja</strong> de la sede pagadora seleccionada.
                </div>
              </div>
            ) : (
              <ReceiptPhotosUploader
                files={receiptFiles}
                onChange={setReceiptFiles}
                disabled={saving}
                label="Comprobantes / Fotos de Transferencia Bancaria (Tesorería)"
                helperText="Puedes tomar fotos con la cámara o subir archivos (imágenes o PDF) del soporte de la transferencia."
              />
            )}
          </div>

          {/* Notas */}
          <label className="field" style={{ margin: 0 }}>
            <span>Notas u Observaciones del Pago</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre extras, acuerdos o incidencias de la quincena"
            />
          </label>

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
              {saving ? "Generando Pago y Voucher…" : "Generar Pago y Voucher"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
