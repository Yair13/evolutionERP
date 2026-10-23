import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import type { CashIncomeItem } from "../../api/finance.js";

type Props = {
  open: boolean;
  income: CashIncomeItem | null;
  onClose: () => void;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  return formatBogotaDateTime(iso, { dateStyle: "short", timeStyle: "short" });
}

const CATEGORY_LABELS: Record<string, string> = {
  driver_refund: "Devolución de Conductor / Viáticos",
  scrap_sale: "Venta de Cuero / Retal / Desecho",
  operational_refund: "Reintegro Operativo",
  other: "Otros Ingresos de Dinero",
};

export function PrintCashIncomeVoucherModal({ open, income, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove("inv-printing-income-ticket");
    };
  }, []);

  if (!open || !income) return null;

  function handlePrint() {
    document.body.classList.add("inv-printing-income-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-income-ticket");
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
      className="income-ticket-body"
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
          SEDE: {income.warehouseName.toUpperCase()} ({income.warehouseCode})
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
          RECIBO DE CAJA / COMPROBANTE DE INGRESO
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
          {income.voucherNumber}
        </div>
        <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
          FECHA: {formatDate(income.createdAt)}
        </div>
      </div>

      {/* Datos de Quien Entrega el Dinero */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 800 }}>RECIBIDO DE:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>{income.payerName}</span>
        </div>
        {income.payerDoc && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>DOC / CÉDULA:</span>
            <span>{income.payerDoc}</span>
          </div>
        )}
        {income.payerPhone && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>TELÉFONO:</span>
            <span>{income.payerPhone}</span>
          </div>
        )}
      </div>

      {/* Concepto y Categoría */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
          fontSize: "9px",
        }}
      >
        <div style={{ marginBottom: "1px" }}>
          <span style={{ fontWeight: 800 }}>TIPO: </span>
          <span>{CATEGORY_LABELS[income.category] || "Otros Ingresos"}</span>
        </div>
        <div>
          <span style={{ fontWeight: 800 }}>CONCEPTO: </span>
          <span style={{ fontWeight: 600 }}>{income.concept}</span>
        </div>
        {income.notes && (
          <div style={{ marginTop: "2px", fontStyle: "italic", fontSize: "8px", color: "#222" }}>
            Obs: {income.notes}
          </div>
        )}
      </div>

      {/* Método de Pago y Referencia */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "3px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 700 }}>MEDIO DE PAGO:</span>
          <span style={{ fontWeight: 800 }}>{income.paymentMethod.toUpperCase()}</span>
        </div>
        {income.referenceCode && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>Nº TRANSACCIÓN:</span>
            <span>{income.referenceCode}</span>
          </div>
        )}
        {income.createdByName && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>REGISTRADO POR:</span>
            <span>{income.createdByName}</span>
          </div>
        )}
      </div>

      {/* Total Destacado */}
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
          TOTAL DINERO RECIBIDO
        </div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 900,
            letterSpacing: "0.02em",
            color: "#000000",
          }}
        >
          {formatMoney(income.amount)}
        </div>
      </div>

      {/* Mensaje de Constancia */}
      <div
        style={{
          fontSize: "7.5px",
          textAlign: "center",
          color: "#333",
          margin: "4px 0 6px 0",
          lineHeight: 1.15,
        }}
      >
        Constancia de recepción de dineros no correspondientes a ventas regulares de inventario.
      </div>

      {/* Bloque de Firmas (2 columnas compactas para firma entrega y recibe) */}
      <div
        style={{
          marginTop: "6px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        {/* Firma Quien Entrega */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "20px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            FIRMA ENTREGA
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
            {income.payerName}
          </div>
          {income.payerDoc && (
            <div style={{ fontSize: "6.5px", color: "#333" }}>C.C. {income.payerDoc}</div>
          )}
        </div>

        {/* Firma Quien Recibe */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "20px" }} />
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
            {income.createdByName || "Cajero"}
          </div>
          <div style={{ fontSize: "6.5px", color: "#333" }}>Responsable / Sede</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal print-modal-container"
        role="dialog"
        aria-labelledby="print-income-voucher-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Printer size={20} color="#059669" />
            <h2 id="print-income-voucher-title" className="inv-modal__title" style={{ fontSize: "1rem" }}>
              Recibo de Caja / Comprobante de Ingreso (80 mm)
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
            background: "#f1f5f9",
            padding: "16px",
            display: "flex",
            justifyContent: "center",
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

        <div
          className="inv-modal__actions no-print"
          style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "12px 16px" }}
        >
          <button type="button" className="inv-btn inv-btn--secondary" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={handlePrint}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Printer size={16} />
            Imprimir Voucher
          </button>
        </div>
      </div>

      {/* PORTAL PARA IMPRESIÓN DIRECTA FUERA DEL ARBOL DE COMPONENTES */}
      {portalReady &&
        createPortal(
          <div id="inv-income-ticket-print" aria-hidden="true">
            {renderTicketContent()}
          </div>,
          document.body
        )}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-income-ticket-print {
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
          body.inv-printing-income-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-income-ticket > *:not(#inv-income-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* Muestra únicamente el contenedor de la tirilla en la raíz del documento */
          body.inv-printing-income-ticket #inv-income-ticket-print {
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

          body.inv-printing-income-ticket #inv-income-ticket-print .income-ticket-body {
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
