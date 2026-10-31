import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";

export interface LayawayPaymentVoucherItem {
  name?: string;
  productName?: string;
  referenceCode?: string;
  quantity: number;
  unitPrice: number;
}

export interface LayawayPaymentVoucherData {
  // Comprobante de abono
  receiptNumber: string;
  createdAt: string;
  amount: number;
  paymentMethod: string;
  notes?: string | null;
  createdByName?: string | null;

  // Datos del apartado / plan separe
  layawayCode: string;
  warehouseName: string;
  warehouseCode: string;
  customerName: string;
  customerTaxId?: string | null;
  customerPhone?: string | null;
  targetAmount: number;
  paidAmount: number;
  remainingAmount: number;
  expiryDate?: string | null;
  layawayNotes?: string | null;
  items?: LayawayPaymentVoucherItem[];
}

type Props = {
  open: boolean;
  data: LayawayPaymentVoucherData | null;
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

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    efectivo: "Efectivo 💵",
    bancolombia: "Bancolombia 🟡",
    davivienda: "Davivienda 🔴",
    nequi: "Nequi 🟣",
    daviplata: "Daviplata 🔴",
    bold: "Bold 🔵",
    addi: "Addi 🟢",
    sistecredito: "Sistecrédito",
    saldo_a_favor: "Saldo a Favor 💰",
  };
  return map[method?.toLowerCase()] ?? (method || "Efectivo");
}

export function PrintLayawayPaymentVoucherModal({ open, data, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove("inv-printing-layaway-ticket");
    };
  }, []);

  if (!open || !data) return null;

  function handlePrint() {
    document.body.classList.add("inv-printing-layaway-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-layaway-ticket");
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
      className="layaway-ticket-body"
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
          SEDE: {data.warehouseName.toUpperCase()} ({data.warehouseCode})
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
          RECIBO DE ABONO · PLAN SEPARE
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
          {data.receiptNumber}
        </div>
        <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
          FECHA: {formatDate(data.createdAt)}
        </div>
      </div>

      {/* Datos del Apartado y Cliente */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "4px",
          marginBottom: "4px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 800 }}>APARTADO:</span>
          <span style={{ fontWeight: 900, fontSize: "10px" }}>{data.layawayCode}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 700 }}>CLIENTE:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>{data.customerName}</span>
        </div>
        {data.customerTaxId && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>DOC / CÉDULA:</span>
            <span>{data.customerTaxId}</span>
          </div>
        )}
        {data.customerPhone && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>TELÉFONO:</span>
            <span>{data.customerPhone}</span>
          </div>
        )}
        {data.expiryDate && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1px" }}>
            <span style={{ fontWeight: 700 }}>FECHA LÍMITE / VENCE:</span>
            <span style={{ fontWeight: 800 }}>{data.expiryDate}</span>
          </div>
        )}
      </div>

      {/* Artículos apartados (si existen) */}
      {data.items && data.items.length > 0 && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "4px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: "2px", textTransform: "uppercase" }}>
            Artículos en Separación:
          </div>
          {data.items.map((it, idx) => {
            const name = it.name || it.productName || "Artículo";
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "1px",
                  lineHeight: 1.2,
                }}
              >
                <span>
                  {it.quantity}x {name} {it.referenceCode ? `(${it.referenceCode})` : ""}
                </span>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatMoney(it.quantity * it.unitPrice)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Observaciones generales del apartado */}
      {data.layawayNotes && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "3px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <span style={{ fontWeight: 700 }}>DETALLE / ARTÍCULOS: </span>
          <span>{data.layawayNotes}</span>
        </div>
      )}

      {/* Bloque Financiero del Abono */}
      <div
        style={{
          borderBottom: "1.5px dashed #000000",
          paddingBottom: "4px",
          marginBottom: "5px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span>VALOR TOTAL PLAN:</span>
          <span style={{ fontWeight: 800 }}>{formatMoney(data.targetAmount)}</span>
        </div>

        {/* Destacado del abono actual */}
        <div
          style={{
            background: "#f1f5f9",
            border: "1px solid #000000",
            borderRadius: "3px",
            padding: "4px",
            margin: "3px 0",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "8.5px", fontWeight: 800, textTransform: "uppercase" }}>
            VALOR ABONADO EN ESTE RECIBO
          </div>
          <div style={{ fontSize: "14px", fontWeight: 900, margin: "1px 0" }}>
            {formatMoney(data.amount)}
          </div>
          <div style={{ fontSize: "8.5px", fontWeight: 700 }}>
            MEDIO: {methodLabel(data.paymentMethod).toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
          <span>TOTAL ACUMULADO ABONADO:</span>
          <span style={{ fontWeight: 800 }}>{formatMoney(data.paidAmount)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "2px",
            fontSize: "10px",
          }}
        >
          <span style={{ fontWeight: 900 }}>SALDO PENDIENTE:</span>
          <span style={{ fontWeight: 900 }}>{formatMoney(data.remainingAmount)}</span>
        </div>
      </div>

      {/* Notas del abono */}
      {data.notes && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "3px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <span style={{ fontWeight: 700 }}>OBSERVACIÓN DEL ABONO: </span>
          <span>{data.notes}</span>
        </div>
      )}

      {/* Atendido por */}
      <div style={{ fontSize: "8.5px", marginBottom: "8px" }}>
        <span>REGISTRADO POR: </span>
        <span style={{ fontWeight: 800 }}>
          {data.createdByName ? data.createdByName.toUpperCase() : "CAJERO EN TURNO"}
        </span>
      </div>

      {/* Espacio para Firma del Cliente */}
      <div style={{ marginTop: "14px", textAlign: "center" }}>
        <div
          style={{
            borderTop: "1px solid #000000",
            width: "80%",
            margin: "0 auto 2px auto",
          }}
        />
        <div style={{ fontSize: "8px", fontWeight: 800, textTransform: "uppercase" }}>
          FIRMA DEL CLIENTE / RECIBÍ CONFORME
        </div>
        <div style={{ fontSize: "7.5px", color: "#333333" }}>
          C.C. {data.customerTaxId || "____________________"}
        </div>
      </div>

      {/* Pie de Página / Agradecimiento */}
      <div
        style={{
          marginTop: "10px",
          textAlign: "center",
          fontSize: "7.5px",
          color: "#000000",
          lineHeight: 1.25,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          Conserve este comprobante para reclamar su mercancía apartada.
        </div>
        <div>Los planes de apartado se rigen según las condiciones de la tienda.</div>
        <div style={{ fontWeight: 800, marginTop: "2px" }}>¡GRACIAS POR SU COMPRA!</div>
      </div>
    </div>
  );

  return (
    <div
      className="inv-modal-backdrop"
      style={{
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="inv-modal no-print"
        role="dialog"
        aria-labelledby="layaway-print-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "430px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "8px",
          background: "#ffffff",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
      >
        {/* Cabecera del Modal */}
        <div
          className="inv-modal__header no-print"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Printer size={18} color="#4f46e5" />
            <h2
              id="layaway-print-modal-title"
              style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#0f172a" }}
            >
              Comprobante de Abono · Plan Separe
            </h2>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={onClose}
            title="Cerrar ventana"
            style={{ padding: "4px", border: "none", background: "transparent", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Vista Previa de la Tirilla POS */}
        <div
          className="inv-modal__body no-print"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: "#64748b",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
              borderRadius: "4px",
              background: "#ffffff",
              padding: "4px",
            }}
          >
            {renderTicketContent()}
          </div>
        </div>

        {/* Acciones */}
        <div
          className="inv-modal__actions no-print"
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
            padding: "12px 16px",
            borderTop: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
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
            Imprimir Comprobante
          </button>
        </div>
      </div>

      {/* PORTAL PARA IMPRESIÓN DIRECTA FUERA DEL ARBOL DE COMPONENTES */}
      {portalReady &&
        createPortal(
          <div id="inv-layaway-payment-ticket-print" aria-hidden="true">
            {renderTicketContent()}
          </div>,
          document.body
        )}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-layaway-payment-ticket-print {
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
          body.inv-printing-layaway-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-layaway-ticket > *:not(#inv-layaway-payment-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* Muestra únicamente el contenedor de la tirilla en la raíz del documento */
          body.inv-printing-layaway-ticket #inv-layaway-payment-ticket-print {
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

          body.inv-printing-layaway-ticket #inv-layaway-payment-ticket-print .layaway-ticket-body {
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
