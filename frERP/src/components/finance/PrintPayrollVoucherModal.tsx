import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [portalReady, setPortalReady] = useState(false);
  const isCash = payment.paymentMethod.toLowerCase() === "efectivo";
  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const receiptUrl = payment.transferReceiptUrl
    ? (payment.transferReceiptUrl.startsWith("http")
        ? payment.transferReceiptUrl
        : `${apiBase}${payment.transferReceiptUrl}`)
    : null;

  useEffect(() => {
    setPortalReady(true);

    const handleBeforePrint = () => {
      document.body.classList.add("inv-printing-payroll-ticket");
    };
    const handleAfterPrint = () => {
      document.body.classList.remove("inv-printing-payroll-ticket");
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      document.body.classList.remove("inv-printing-payroll-ticket");
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  function handlePrint() {
    document.body.classList.add("inv-printing-payroll-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-payroll-ticket");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 100);
  }

  // Tirilla optimizada para rollos térmicos POS de 80 mm (ancho 70 mm)
  const renderTicketContent = () => (
    <div
      className="payroll-ticket-body"
      style={{
        width: "70mm",
        maxWidth: "70mm",
        margin: "0 auto",
        padding: "2mm 2.5mm 3mm 2.5mm",
        background: "#ffffff",
        color: "#000000",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "9.5px",
        lineHeight: 1.25,
        boxSizing: "border-box",
      }}
    >
      {/* Encabezado */}
      <div
        style={{
          textAlign: "center",
          borderBottom: "1.5px dashed #000000",
          paddingBottom: "4px",
          marginBottom: "4px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "#000000",
          }}
        >
          Evolution ERP
        </div>
        <div style={{ fontSize: "9px", fontWeight: 700, color: "#000000", marginTop: "1px" }}>
          SEDE: {(payment.warehouseName ?? "SEDE").toUpperCase()} ({payment.warehouseCode ?? "MAIN"})
        </div>
        <div
          style={{
            fontSize: "10.5px",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginTop: "3px",
            color: "#000000",
          }}
        >
          COMPROBANTE DE PAGO DE NÓMINA
        </div>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.05em",
            marginTop: "2px",
            color: "#000000",
          }}
        >
          {payment.voucherNumber}
        </div>
        <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
          FECHA DE EMISIÓN: {payment.paymentDate}
        </div>
      </div>

      {/* Datos del Colaborador */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 800 }}>COLABORADOR:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>{payment.employeeName ?? "—"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 700 }}>DOCUMENTO:</span>
          <span>
            {payment.employeeDocType ?? "CC"} {payment.employeeDocNumber ?? "—"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 700 }}>CARGO / PUESTO:</span>
          <span>{payment.employeePosition ?? "—"}</span>
        </div>
        {payment.employeeCode && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>CÓDIGO EMP:</span>
            <span>{payment.employeeCode}</span>
          </div>
        )}
      </div>

      {/* Período Liquidado */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
          fontSize: "8.5px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 700 }}>CONCEPTO:</span>
          <span style={{ fontWeight: 700 }}>{payment.periodConcept}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>PERÍODO:</span>
          <span>
            {payment.periodStart} al {payment.periodEnd}
          </span>
        </div>
      </div>

      {/* Desglose Salarial */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span>Sueldo Base:</span>
          <span style={{ fontWeight: 700 }}>{formatMoney(payment.baseSalary)}</span>
        </div>
        {payment.bonuses > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span>(+) Bonificaciones / Aux:</span>
            <span style={{ fontWeight: 700, color: "#000000" }}>+ {formatMoney(payment.bonuses)}</span>
          </div>
        )}
        {payment.deductions > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span>(-) Deducciones / Prést:</span>
            <span style={{ fontWeight: 700, color: "#000000" }}>- {formatMoney(payment.deductions)}</span>
          </div>
        )}
      </div>

      {/* Total Neto Pagado Destacado */}
      <div
        style={{
          borderTop: "1.5px solid #000000",
          borderBottom: "1.5px solid #000000",
          padding: "3px 0",
          margin: "3px 0",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase" }}>
          TOTAL NETO A PAGAR
        </div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 900,
            letterSpacing: "0.02em",
            color: "#000000",
          }}
        >
          {formatMoney(payment.netAmount)}
        </div>
      </div>

      {/* Monto en letras */}
      <div
        style={{
          fontSize: "7.5px",
          lineHeight: 1.15,
          textAlign: "center",
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
        }}
      >
        <strong>SON:</strong> {numberToWordsCOP(payment.netAmount)}
      </div>

      {/* Forma de Pago y Notas */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "4px",
          fontSize: "8.5px",
        }}
      >
        <div>
          <strong>FORMA PAGO:</strong>{" "}
          {isCash
            ? "EFECTIVO (CAJA DE SEDE)"
            : `TRANSF. BANCARIA (${payment.paymentMethod.toUpperCase()})`}
        </div>
        {isCash ? (
          <div style={{ fontSize: "7.5px", color: "#333333", marginTop: "1px" }}>
            ✓ Descontado del cierre y arqueo de caja de sede.
          </div>
        ) : (
          payment.referenceCode && (
            <div style={{ fontSize: "7.5px", color: "#333333", marginTop: "1px" }}>
              Ref: {payment.referenceCode}
            </div>
          )
        )}
        {payment.notes && (
          <div style={{ fontSize: "7.5px", color: "#333333", marginTop: "1px" }}>
            <strong>Nota:</strong> {payment.notes}
          </div>
        )}
      </div>

      {/* Bloque de Firmas Compactas */}
      <div
        style={{
          marginTop: "6px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        {/* Firma Autorizado / Empleador */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "22px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            AUTORIZADO
          </div>
          <div
            style={{
              fontSize: "7px",
              color: "#000000",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {payment.createdByName ?? "Administración"}
          </div>
          <div style={{ fontSize: "6.5px", color: "#333333" }}>Empleador / Sede</div>
        </div>

        {/* Firma Colaborador */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "22px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            RECIBÍ CONFORME
          </div>
          <div
            style={{
              fontSize: "7px",
              color: "#000000",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {payment.employeeName}
          </div>
          <div style={{ fontSize: "6.5px", color: "#333333" }}>
            {payment.employeeDocType ?? "CC"}: {payment.employeeDocNumber}
          </div>
        </div>
      </div>
    </div>
  );

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
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior (no se imprime) */}
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
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Voucher de Nómina (80 mm) · {payment.voucherNumber}
            </span>
          </div>
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
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Vista previa en pantalla */}
        <div
          className="no-print"
          style={{
            background: "#f1f5f9",
            padding: "16px",
            display: "flex",
            justifyContent: "center",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <div
            style={{
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              borderRadius: "4px",
              background: "#ffffff",
              padding: "4px",
            }}
          >
            {renderTicketContent()}
          </div>
        </div>

        {/* Barra inferior de acciones */}
        <div
          className="no-print"
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <div>
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "6px 12px",
                  background: "#0284c7",
                  color: "#fff",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                <Download size={14} /> Soporte Bancario
              </a>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="inv-btn inv-btn--secondary"
              onClick={onClose}
              style={{
                padding: "6px 14px",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={handlePrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
                padding: "6px 16px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Printer size={16} />
              Imprimir Voucher (80 mm)
            </button>
          </div>
        </div>
      </div>

      {/* PORTAL DE IMPRESIÓN DIRECTO EN BODY */}
      {portalReady &&
        createPortal(
          <div id="inv-payroll-voucher-print" aria-hidden="true">
            {renderTicketContent()}
          </div>,
          document.body
        )}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-payroll-voucher-print {
          display: none;
        }

        @media print {
          @page {
            size: auto;
            margin: 0mm;
          }

          html, body {
            height: auto !important;
            min-height: 0 !important;
            max-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: hidden !important;
          }

          #root {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* Oculta la app y el fondo cuando se imprime el voucher */
          body.inv-printing-payroll-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-payroll-ticket > *:not(#inv-payroll-voucher-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* Muestra únicamente el contenedor de la tirilla en la raíz del documento */
          body.inv-printing-payroll-ticket #inv-payroll-voucher-print {
            display: block !important;
            position: static !important;
            width: 70mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          body.inv-printing-payroll-ticket #inv-payroll-voucher-print .payroll-ticket-body {
            display: block !important;
            width: 70mm !important;
            max-width: 70mm !important;
            margin: 0 !important;
            padding: 2mm 2.5mm 3mm 2.5mm !important;
            box-sizing: border-box !important;
            color: #000000 !important;
            background: #ffffff !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
