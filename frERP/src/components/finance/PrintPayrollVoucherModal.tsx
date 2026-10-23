import { Printer, X, Download, FileText } from "lucide-react";
import type { PayrollPaymentItem } from "../../api/finance.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function numberToWordsCOP(num: number): string {
  if (num === 0) return "CERO PESOS M/CTE";
  const units = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const tens = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const teens = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const hundreds = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  function convertGroup(n: number): string {
    let output = "";
    if (n === 100) return "CIEN";
    if (n >= 100) {
      output += hundreds[Math.floor(n / 100)] + " ";
      n %= 100;
    }
    if (n >= 10 && n <= 19) {
      output += teens[n - 10] + " ";
      return output.trim();
    }
    if (n >= 20) {
      if (n === 20) {
        output += "VEINTE ";
      } else if (n < 30) {
        output += "VEINTI" + units[n % 10] + " ";
      } else {
        output += tens[Math.floor(n / 10)] + " ";
        if (n % 10 > 0) output += "Y " + units[n % 10] + " ";
      }
      return output.trim();
    }
    if (n > 0) {
      output += units[n] + " ";
    }
    return output.trim();
  }

  let n = Math.floor(num);
  let words = "";

  if (n >= 1_000_000) {
    const millions = Math.floor(n / 1_000_000);
    words += (millions === 1 ? "UN MILLÓN " : convertGroup(millions) + " MILLONES ");
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    const thousands = Math.floor(n / 1_000);
    words += (thousands === 1 ? "MIL " : convertGroup(thousands) + " MIL ");
    n %= 1_000;
  }
  if (n > 0) {
    words += convertGroup(n) + " ";
  }

  return (words.trim() + " PESOS M/CTE").toUpperCase();
}

type Props = {
  payment: PayrollPaymentItem;
  onClose: () => void;
};

export function PrintPayrollVoucherModal({ payment, onClose }: Props) {
  const isCash = payment.paymentMethod.toLowerCase() === "efectivo";
  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const receiptUrl = payment.transferReceiptUrl
    ? (payment.transferReceiptUrl.startsWith("http")
        ? payment.transferReceiptUrl
        : `${apiBase}${payment.transferReceiptUrl}`)
    : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
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
          color: "#111827",
          borderRadius: 12,
          maxWidth: 680,
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior de acciones (no se imprime) */}
        <div
          className="no-print"
          style={{
            padding: "0.85rem 1.25rem",
            background: "#1e293b",
            color: "#ffffff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileText size={20} className="text-primary" />
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>
              Comprobante de Pago de Nómina · {payment.voucherNumber}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={() => window.print()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
                padding: "6px 14px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <Printer size={16} /> Imprimir Voucher
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenido imprimible */}
        <div
          className="printable-payroll-voucher"
          style={{
            padding: "2rem",
            overflowY: "auto",
            fontSize: "0.85rem",
            lineHeight: 1.45,
            fontFamily: "Arial, sans-serif",
          }}
        >
          {/* Estilos para impresión física */}
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .no-print { display: none !important; }
              .printable-payroll-voucher, .printable-payroll-voucher * { visibility: visible; }
              .printable-payroll-voucher {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                padding: 0.5cm !important;
                margin: 0 !important;
                color: #000 !important;
                background: #fff !important;
              }
            }
          `}</style>

          {/* Encabezado */}
          <div
            style={{
              borderBottom: "2px solid #0f172a",
              paddingBottom: "1rem",
              marginBottom: "1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 2px 0", fontSize: "1.3rem", fontWeight: 900, letterSpacing: -0.5 }}>
                EVOLUTION ERP
              </h2>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                COMPROBANTE DE LIQUIDACIÓN Y PAGO DE NÓMINA
              </div>
              <div style={{ fontSize: "0.8rem", color: "#334155", marginTop: 4 }}>
                <strong>Sede Pagadora:</strong> {payment.warehouseName ?? "Sede Central"} ({payment.warehouseCode ?? "MAIN"})
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: "1rem",
                  color: "#0f172a",
                }}
              >
                {payment.voucherNumber}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>
                Fecha de Emisión: {payment.paymentDate}
              </div>
            </div>
          </div>

          {/* Datos del Empleado */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#475569", marginBottom: 6 }}>
              Información del Colaborador
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem" }}>
              <div>
                <strong>Colaborador:</strong> {payment.employeeName ?? "—"}
              </div>
              <div>
                <strong>Documento:</strong> {payment.employeeDocType ?? "CC"} {payment.employeeDocNumber ?? "—"}
              </div>
              <div>
                <strong>Cargo / Puesto:</strong> {payment.employeePosition ?? "—"}
              </div>
              <div>
                <strong>Código:</strong> {payment.employeeCode ?? "—"}
              </div>
            </div>
          </div>

          {/* Período Liquidado */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.6rem 0.85rem",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 6,
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <strong>Concepto:</strong> {payment.periodConcept}
            </div>
            <div>
              <strong>Período:</strong> {payment.periodStart} al {payment.periodEnd}
            </div>
          </div>

          {/* Tabla de Liquidación */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
                <th style={{ padding: "8px 10px" }}>Concepto Salarial</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Devengos (+)</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Deducciones (-)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px 10px" }}>Sueldo / Salario Base Acordado</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                  {formatMoney(payment.baseSalary)}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
              </tr>
              {payment.bonuses > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Bonificaciones / Comisiones / Auxilios</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#16a34a" }}>
                    + {formatMoney(payment.bonuses)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                </tr>
              )}
              {payment.deductions > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Deducciones / Anticipos / Préstamos</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#dc2626" }}>
                    - {formatMoney(payment.deductions)}
                  </td>
                </tr>
              )}
              <tr style={{ background: "#f8fafc", borderTop: "2px solid #0f172a", fontSize: "1rem" }}>
                <td style={{ padding: "10px", fontWeight: 800 }}>NETO A PAGAR</td>
                <td colSpan={2} style={{ padding: "10px", textAlign: "right", fontWeight: 900, color: "#0f172a" }}>
                  {formatMoney(payment.netAmount)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Monto en Letras */}
          <div
            style={{
              padding: "0.6rem 0.85rem",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 6,
              marginBottom: "1.25rem",
              fontSize: "0.8rem",
            }}
          >
            <strong>SON:</strong> {numberToWordsCOP(payment.netAmount)}
          </div>

          {/* Método de Pago y Observación */}
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              background: isCash ? "#fef3c7" : "#ecfdf5",
              border: `1px solid ${isCash ? "#fde68a" : "#a7f3d0"}`,
              marginBottom: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Forma de Pago: {isCash ? "💵 Efectivo (Caja de Sede)" : `🏦 Transferencia Bancaria (${payment.paymentMethod.toUpperCase()})`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: 2 }}>
                {isCash
                  ? "✓ Descontado del valor del cierre y arqueo de caja de la sede."
                  : (payment.referenceCode ? `Referencia Bancaria: ${payment.referenceCode}` : "Transferencia bancaria registrada")}
              </div>
            </div>

            {receiptUrl && (
              <div className="no-print">
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "4px 8px",
                    background: "#0284c7",
                    color: "#fff",
                    borderRadius: 4,
                    textDecoration: "none",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  <Download size={14} /> Soporte Bancario
                </a>
              </div>
            )}
          </div>

          {payment.notes && (
            <div style={{ fontSize: "0.8rem", color: "#475569", marginBottom: "1.5rem" }}>
              <strong>Notas / Observaciones:</strong> {payment.notes}
            </div>
          )}

          {/* Bloque de Firmas Formales */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
              marginTop: "2.5rem",
              paddingTop: "1rem",
            }}
          >
            {/* Firma Empleador / Pagador */}
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #0f172a", height: 50, marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>AUTORIZADO / EMPLEADOR</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {payment.createdByName ?? "Administración"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Sede: {payment.warehouseName ?? "Principal"}
              </div>
            </div>

            {/* Firma Colaborador */}
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #0f172a", height: 50, marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>RECIBÍ A CONFORMIDAD</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {payment.employeeName}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {payment.employeeDocType ?? "CC"}: {payment.employeeDocNumber}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
