import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, FileSpreadsheet } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import type { GeneralClosureRecord } from "../../api/finance.js";

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

type Props = {
  closure: GeneralClosureRecord;
  onClose: () => void;
};

export function PrintGeneralClosureModal({ closure, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);

    const handleBeforePrint = () => {
      document.body.classList.add("inv-printing-general-closure-ticket");
    };
    const handleAfterPrint = () => {
      document.body.classList.remove("inv-printing-general-closure-ticket");
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      document.body.classList.remove("inv-printing-general-closure-ticket");
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  function handlePrint() {
    document.body.classList.add("inv-printing-general-closure-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-general-closure-ticket");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 100);
  }

  const renderTicketContent = () => (
    <div
      className="general-closure-ticket-body"
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
          EVOLUTION ERP
        </div>
        <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#000000", marginTop: "1px" }}>
          ACTA DE CIERRE CONTABLE GENERAL
        </div>
        <div style={{ fontSize: "9px", fontWeight: 800, color: "#000000", marginTop: "1px" }}>
          SEDE:{" "}
          {closure.warehouseName
            ? `${closure.warehouseName.toUpperCase()} (${closure.warehouseCode})`
            : "CONSOLIDADO GENERAL"}
        </div>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.03em",
            marginTop: "2px",
            color: "#000000",
          }}
        >
          {closure.closureCode}
        </div>
        <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
          Período: <strong>{closure.dateFrom}</strong> al <strong>{closure.dateTo}</strong>
        </div>
        <div style={{ fontSize: "8px", color: "#000000" }}>
          Emisión: {closure.createdAt ? formatBogotaDateTime(closure.createdAt) : "—"}
        </div>
      </div>

      {/* Resumen Ventas y Operación */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "4px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
          <span>VENTAS TOTALES:</span>
          <span>{formatMoney(closure.totalSales)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5px" }}>
          <span>· Ventas Efectivo:</span>
          <span>{formatMoney(closure.totalCashSales)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5px" }}>
          <span>· Ventas Bancos/Digital:</span>
          <span>{formatMoney(closure.totalBankSales)}</span>
        </div>

        {(closure.totalOtherIncomes ?? 0) > 0 && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 800,
                marginTop: "2px",
              }}
            >
              <span>OTROS INGRESOS:</span>
              <span>+ {formatMoney(closure.totalOtherIncomes ?? 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5px" }}>
              <span>· Efectivo:</span>
              <span>{formatMoney(closure.totalCashOtherIncomes ?? 0)}</span>
            </div>
          </>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "2px",
            fontSize: "8.5px",
          }}
        >
          <span>Egresos Operativos:</span>
          <span>- {formatMoney(closure.totalOutflows)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5px" }}>
          <span>Pagos de Nómina:</span>
          <span>- {formatMoney(closure.totalPayroll)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 800,
            borderTop: "1px solid #000000",
            marginTop: "2px",
            paddingTop: "2px",
          }}
        >
          <span>EFECTIVO NETO OPERATIVO:</span>
          <span>{formatMoney(closure.totalNetCash)}</span>
        </div>
      </div>

      {/* Liquidación de Caja / Retiro */}
      <div
        style={{
          border: "1.5px solid #000000",
          borderRadius: "4px",
          padding: "3px 5px",
          marginBottom: "4px",
          fontSize: "8.5px",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: "9px", marginBottom: "2px" }}>
          LIQUIDACIÓN DE CAJA / RETIRO
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Saldo Arranque:</span>
          <strong>{formatMoney(closure.openingCash ?? 0)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Total en Caja:</span>
          <strong>
            {formatMoney(
              closure.totalCashAvailable ?? (closure.openingCash ?? 0) + closure.totalNetCash
            )}
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Fondo dejado en sede:</span>
          <strong>{formatMoney(closure.cashToKeep)}</strong>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 900,
            fontSize: "10px",
            borderTop: "1px solid #000000",
            marginTop: "2px",
            paddingTop: "2px",
          }}
        >
          <span>A RETIRAR:</span>
          <span>{formatMoney(closure.cashToWithdraw)}</span>
        </div>
      </div>

      {/* Desglose por Medio de Pago */}
      {closure.paymentBreakdown && closure.paymentBreakdown.length > 0 && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "3px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: "2px", textTransform: "uppercase" }}>
            Desglose Medios de Pago
          </div>
          {closure.paymentBreakdown.map((item) => (
            <div
              key={item.method}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "1px 0",
              }}
            >
              <span>
                {item.label} ({item.count}):
              </span>
              <strong>{formatMoney(item.totalAmount)}</strong>
            </div>
          ))}
        </div>
      )}

      {closure.notes && (
        <div
          style={{
            fontSize: "8px",
            borderBottom: "1px dashed #000000",
            paddingBottom: "3px",
            marginBottom: "4px",
          }}
        >
          <strong>Obs:</strong> {closure.notes}
        </div>
      )}

      {/* Firmas */}
      <div
        style={{
          marginTop: "6px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "18px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            {closure.createdByName ?? "RESPONSABLE"}
          </div>
          <div style={{ fontSize: "7px" }}>Admin / Cajero General</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "18px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            REVISADO Y APROBADO
          </div>
          <div style={{ fontSize: "7px" }}>Contabilidad / Gerencia</div>
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
        zIndex: 1100,
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
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de acciones (no-print) */}
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
            <FileSpreadsheet size={20} className="text-primary" />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Cierre General · {closure.closureCode}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={handlePrint}
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
              <Printer size={16} /> Imprimir Tirilla
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

        {/* Vista previa en pantalla */}
        <div
          className="no-print"
          style={{
            padding: "1rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#f8fafc",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "285px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "10px",
              background: "#ffffff",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
            }}
          >
            {renderTicketContent()}
          </div>
        </div>
      </div>

      {/* PORTAL DE IMPRESIÓN DIRECTO EN BODY */}
      {portalReady
        ? createPortal(
            <div id="inv-general-closure-ticket-print" aria-hidden="true">
              {renderTicketContent()}
            </div>,
            document.body
          )
        : null}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-general-closure-ticket-print {
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

          body.inv-printing-general-closure-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-general-closure-ticket > *:not(#inv-general-closure-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          body.inv-printing-general-closure-ticket #inv-general-closure-ticket-print {
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

          body.inv-printing-general-closure-ticket #inv-general-closure-ticket-print .general-closure-ticket-body {
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
