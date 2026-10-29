import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import type { CashOutflowItem } from "../../api/finance.js";

type Props = {
  open: boolean;
  outflow: CashOutflowItem | null;
  onClose: () => void;
};

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

function formatDate(iso: string | null): string {
  return formatBogotaDateTime(iso, { dateStyle: "short", timeStyle: "short" });
}

export function PrintEgressVoucherModal({ open, outflow, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove("inv-printing-egress-ticket");
    };
  }, []);

  if (!open || !outflow) return null;

  function handlePrint() {
    document.body.classList.add("inv-printing-egress-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-egress-ticket");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 100);
  }

  // Tarjeta visual del ticket (70 mm de ancho para rollo POS de 80 mm)
  const renderTicketContent = () => (
    <div
      className="egress-ticket-body"
      style={{
        width: "70mm",
        maxWidth: "70mm",
        margin: "0 auto",
        padding: "2mm 2.5mm 3mm 2.5mm",
        background: "#ffffff",
        color: "#000000",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "10px",
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
          SEDE: {outflow.warehouseName.toUpperCase()} ({outflow.warehouseCode})
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
          COMPROBANTE DE EGRESO
        </div>
        <div style={{ fontSize: "13px", fontWeight: 900, color: "#000000", marginTop: "1px" }}>
          {outflow.voucherNumber}
        </div>
      </div>

      {/* Datos del Egreso */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "9.5px", color: "#000000" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Fecha:</span>
          <span style={{ fontWeight: 600 }}>{formatDate(outflow.createdAt)}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Pagado a:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>{outflow.beneficiaryName}</span>
        </div>

        {outflow.beneficiaryDoc && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>C.C. / Doc:</span>
            <span>{outflow.beneficiaryDoc}</span>
          </div>
        )}

        {outflow.supplierName && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Proveedor:</span>
            <span style={{ textAlign: "right" }}>
              {outflow.supplierName} {outflow.supplierTaxId ? `(${outflow.supplierTaxId})` : ""}
            </span>
          </div>
        )}

        {outflow.billNumber && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Factura / Rem:</span>
            <span style={{ fontWeight: 700 }}>{outflow.billNumber}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Medio Salida:</span>
          <span style={{ textTransform: "capitalize", fontWeight: 700 }}>
            {outflow.paymentMethod}
          </span>
        </div>

        {outflow.referenceCode && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Ref. Transacción:</span>
            <span>{outflow.referenceCode}</span>
          </div>
        )}

        <div style={{ borderTop: "1px dashed #000000", paddingTop: "2px", marginTop: "2px" }}>
          <div style={{ fontWeight: 700, marginBottom: "1px" }}>Por Concepto de:</div>
          <div
            style={{
              fontStyle: "italic",
              padding: "1px 0",
              wordBreak: "break-word",
              color: "#000000",
            }}
          >
            {outflow.concept}
          </div>
        </div>

        {outflow.notes && (
          <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
            <strong>Obs:</strong> {outflow.notes}
          </div>
        )}
      </div>

      {/* Valor Pagado Destacado */}
      <div
        style={{
          marginTop: "5px",
          padding: "3px 6px",
          border: "1.5px solid #000000",
          borderRadius: "4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ffffff",
        }}
      >
        <span style={{ fontSize: "9.5px", fontWeight: 800 }}>VALOR:</span>
        <span style={{ fontSize: "14px", fontWeight: 900 }}>{formatMoney(outflow.amount)}</span>
      </div>

      {outflow.createdByName && (
        <div style={{ fontSize: "8px", color: "#333333", marginTop: "1px", textAlign: "right" }}>
          Expedido por: {outflow.createdByName}
        </div>
      )}

      {/* Bloque de Firmas (2 columnas compactas) */}
      <div
        style={{
          marginTop: "8px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        {/* Firma Entrega */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "16px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            FIRMA ENTREGA
          </div>
          <div style={{ fontSize: "7px", color: "#000000" }}>Cajero / Responsable</div>
        </div>

        {/* Firma Recibe */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "16px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            FIRMA RECIBE
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
            {outflow.beneficiaryName}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal print-modal-container"
        role="dialog"
        aria-labelledby="print-voucher-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Printer size={20} color="#0d9488" />
            <h2 id="print-voucher-title" className="inv-modal__title" style={{ fontSize: "1rem" }}>
              Comprobante de Egreso (Tirilla 80 mm)
            </h2>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* VISTA PREVIA EN PANTALLA */}
        <div
          className="inv-modal__body no-print"
          style={{
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
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

        {/* Acciones */}
        <div className="inv-modal__actions no-print" style={{ marginTop: "1rem" }}>
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={handlePrint}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Printer size={16} />
            Imprimir Tirilla (80 mm)
          </button>
        </div>
      </div>

      {/* PORTAL DE IMPRESIÓN DIRECTO EN BODY */}
      {portalReady
        ? createPortal(
            <div id="inv-egress-ticket-print" aria-hidden="true">
              {renderTicketContent()}
            </div>,
            document.body
          )
        : null}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-egress-ticket-print {
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

          /* Oculta la app, el fondo y el modal */
          body.inv-printing-egress-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-egress-ticket > *:not(#inv-egress-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* Muestra únicamente el contenedor de la tirilla en la raíz del documento */
          body.inv-printing-egress-ticket #inv-egress-ticket-print {
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

          body.inv-printing-egress-ticket #inv-egress-ticket-print .egress-ticket-body {
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
