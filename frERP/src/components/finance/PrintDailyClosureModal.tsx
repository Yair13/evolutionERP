import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, FileText } from "lucide-react";
import type { DailyClosureRecord } from "../../api/finance.js";

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
  closure: DailyClosureRecord;
  onClose: () => void;
};

export function PrintDailyClosureModal({ closure, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const isBalanced = closure.cashDifference === 0;
  const isShort = closure.cashDifference < 0;

  useEffect(() => {
    setPortalReady(true);

    const handleBeforePrint = () => {
      document.body.classList.add("inv-printing-daily-closure-ticket");
    };
    const handleAfterPrint = () => {
      document.body.classList.remove("inv-printing-daily-closure-ticket");
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      document.body.classList.remove("inv-printing-daily-closure-ticket");
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  function handlePrint() {
    document.body.classList.add("inv-printing-daily-closure-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-daily-closure-ticket");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 100);
  }

  // Tirilla optimizada para impresoras térmicas POS / etiquetas de 80 mm (ancho útil 70 mm)
  const renderTicketContent = () => (
    <div
      className="daily-closure-ticket-body"
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
          ACTA DE CIERRE DIARIO Y ARQUEO DE CAJA
        </div>
        <div style={{ fontSize: "9px", fontWeight: 800, color: "#000000", marginTop: "1px" }}>
          SEDE: {(closure.warehouseName ?? "SEDE").toUpperCase()} ({closure.warehouseCode ?? "MAIN"})
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
          {closure.closingVoucherNumber}
        </div>
        <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
          Fecha Cierre: <strong>{closure.closureDate}</strong>
          {closure.shiftNumber ? ` · Turno ${closure.shiftNumber}` : ""}
        </div>
        {closure.startedAt && (
          <div style={{ fontSize: "8px", color: "#000000" }}>
            Horario:{" "}
            {new Date(closure.startedAt).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            →{" "}
            {closure.closedAt
              ? new Date(closure.closedAt).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Cierre"}
          </div>
        )}
        <div style={{ fontSize: "8.5px", color: "#000000" }}>
          Cajero: <strong>{closure.cashierName ?? closure.createdByName ?? "—"}</strong>
        </div>
      </div>

      {/* Estado de Cuadre */}
      <div
        style={{
          border: "1.5px solid #000000",
          borderRadius: "4px",
          padding: "3px 5px",
          marginBottom: "4px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 900,
            fontSize: "9.5px",
          }}
        >
          <span>
            {isBalanced
              ? "✓ CUADRE EXACTO"
              : isShort
                ? "⚠ FALTANTE EN CAJA"
                : "ℹ SOBRANTE EN CAJA"}
          </span>
          <span style={{ fontSize: "11px" }}>
            {closure.cashDifference > 0
              ? `+${formatMoney(closure.cashDifference)}`
              : formatMoney(closure.cashDifference)}
          </span>
        </div>
        <div style={{ fontSize: "8px", marginTop: "1px" }}>
          Esperado: <strong>{formatMoney(closure.expectedCash)}</strong> · Contado:{" "}
          <strong>{formatMoney(closure.countedCash)}</strong>
        </div>
      </div>

      {/* Cuadro de Liquidación de Efectivo */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "4px",
          fontSize: "9px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 800,
            borderBottom: "1px solid #000000",
            paddingBottom: "2px",
            marginBottom: "2px",
            fontSize: "8.5px",
            textTransform: "uppercase",
          }}
        >
          <span>Concepto Efectivo</span>
          <span>Valor</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
          <span style={{ fontWeight: 700 }}>Base / Saldo Arranque</span>
          <span style={{ fontWeight: 700 }}>{formatMoney(closure.openingCash)}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
          <span>Ventas Mostrador (Efectivo)</span>
          <span style={{ fontWeight: 700 }}>+ {formatMoney(closure.cashSales)}</span>
        </div>

        {closure.cashCreditPayments > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Abonos Créditos (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>+ {formatMoney(closure.cashCreditPayments)}</span>
          </div>
        )}

        {closure.cashLayawayPayments > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Abonos Separe (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>+ {formatMoney(closure.cashLayawayPayments)}</span>
          </div>
        )}

        {closure.cashTransfersReceived > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Remesas Recibidas (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>+ {formatMoney(closure.cashTransfersReceived)}</span>
          </div>
        )}

        {(closure.cashTransfersReturned ?? 0) > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Retorno Traslados (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>
              + {formatMoney(closure.cashTransfersReturned ?? 0)}
            </span>
          </div>
        )}

        {(closure.cashOtherIncomes ?? 0) > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Otros Ingresos (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>+ {formatMoney(closure.cashOtherIncomes ?? 0)}</span>
          </div>
        )}

        {closure.cashOutflows > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Egresos Caja Menor (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>- {formatMoney(closure.cashOutflows)}</span>
          </div>
        )}

        {closure.cashPayroll > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Pagos de Nómina (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>- {formatMoney(closure.cashPayroll)}</span>
          </div>
        )}

        {closure.cashTransfersSent > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
            <span>Remesas Enviadas (Efectivo)</span>
            <span style={{ fontWeight: 700 }}>- {formatMoney(closure.cashTransfersSent)}</span>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #000000",
            marginTop: "2px",
            paddingTop: "2px",
            fontWeight: 800,
          }}
        >
          <span>EFECTIVO ESPERADO</span>
          <span>{formatMoney(closure.expectedCash)}</span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 900,
            fontSize: "10px",
            paddingTop: "1px",
          }}
        >
          <span>EFECTIVO CONTADO</span>
          <span>{formatMoney(closure.countedCash)}</span>
        </div>
      </div>

      {/* Resumen de Medios Digitales y Bancos */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "4px",
          fontSize: "8.5px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 800,
            fontSize: "9px",
          }}
        >
          <span>RECAUDO BANCOS / DIGITAL</span>
          <span>{formatMoney(closure.bankPaymentsTotal)}</span>
        </div>
        <div style={{ fontSize: "7.5px" }}>
          Soportes:{" "}
          {closure.pendingReceiptsCount === 0
            ? "100% Adjuntos"
            : `${closure.pendingReceiptsCount} pendientes`}
        </div>

        {closure.paymentBreakdown && closure.paymentBreakdown.length > 0 && (
          <div style={{ marginTop: "2px", paddingTop: "2px", borderTop: "1px dotted #000000" }}>
            {closure.paymentBreakdown.map((pb) => (
              <div
                key={pb.method}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "8px",
                }}
              >
                <span>{pb.label}:</span>
                <strong>{formatMoney(pb.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Firmas compactas */}
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
            CAJERO / RESPONSABLE
          </div>
          <div style={{ fontSize: "7px", overflow: "hidden", textOverflow: "ellipsis" }}>
            {closure.cashierName ?? closure.createdByName ?? "Cajero"}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "18px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            VERIFICADOR / ADMIN
          </div>
          <div style={{ fontSize: "7px" }}>Firma y Sello</div>
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
            <FileText size={20} className="text-primary" />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Cierre Diario · {closure.closingVoucherNumber}
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
            <div id="inv-daily-closure-ticket-print" aria-hidden="true">
              {renderTicketContent()}
            </div>,
            document.body
          )
        : null}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-daily-closure-ticket-print {
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

          body.inv-printing-daily-closure-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-daily-closure-ticket > *:not(#inv-daily-closure-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          body.inv-printing-daily-closure-ticket #inv-daily-closure-ticket-print {
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

          body.inv-printing-daily-closure-ticket #inv-daily-closure-ticket-print .daily-closure-ticket-body {
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
