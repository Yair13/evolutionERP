import { Printer, X } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import type { CashOutflowItem } from "../../api/finance.js";

type Props = {
  open: boolean;
  outflow: CashOutflowItem | null;
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

export function PrintEgressVoucherModal({ open, outflow, onClose }: Props) {
  if (!open || !outflow) return null;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal print-modal-container"
        role="dialog"
        aria-labelledby="print-voucher-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, maxHeight: "92vh", overflowY: "auto" }}
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

        {/* CONTENIDO DEL TICKET IMPRIMIBLE (80 MM POS) */}
        <div
          className="inv-modal__body printable-ticket"
          style={{
            width: "100%",
            maxWidth: "280px",
            margin: "0 auto",
            padding: "6px 8px",
            background: "#ffffff",
            color: "#000000",
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: "11px",
            lineHeight: 1.25,
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxSizing: "border-box",
          }}
        >
          {/* Encabezado */}
          <div
            style={{
              textAlign: "center",
              borderBottom: "1.5px dashed #000000",
              paddingBottom: "5px",
              marginBottom: "5px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Evolution ERP
            </div>
            <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#222", marginTop: "1px" }}>
              SEDE: {outflow.warehouseName.toUpperCase()} ({outflow.warehouseCode})
            </div>
            <div
              style={{
                fontSize: "10.5px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginTop: "3px",
              }}
            >
              COMPROBANTE DE EGRESO
            </div>
            <div style={{ fontSize: "13px", fontWeight: 900, color: "#000", marginTop: "1px" }}>
              {outflow.voucherNumber}
            </div>
          </div>

          {/* Datos del Egreso */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5px", fontSize: "10px" }}>
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

            <div style={{ borderTop: "1px dashed #bbb", paddingTop: "3px", marginTop: "2px" }}>
              <div style={{ fontWeight: 700, marginBottom: "1px" }}>Por Concepto de:</div>
              <div
                style={{
                  fontStyle: "italic",
                  background: "#f8fafc",
                  padding: "3px 5px",
                  borderRadius: "3px",
                  wordBreak: "break-word",
                }}
              >
                {outflow.concept}
              </div>
            </div>

            {outflow.notes && (
              <div style={{ fontSize: "9px", color: "#444", marginTop: "1px" }}>
                <strong>Obs:</strong> {outflow.notes}
              </div>
            )}
          </div>

          {/* Valor Pagado Destacado */}
          <div
            style={{
              marginTop: "5px",
              padding: "4px 8px",
              border: "1.5px solid #000000",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f1f5f9",
            }}
          >
            <span style={{ fontSize: "9.5px", fontWeight: 800 }}>VALOR:</span>
            <span style={{ fontSize: "14px", fontWeight: 900 }}>{formatMoney(outflow.amount)}</span>
          </div>

          {outflow.createdByName && (
            <div style={{ fontSize: "8px", color: "#555", marginTop: "2px", textAlign: "right" }}>
              Expedido por: {outflow.createdByName}
            </div>
          )}

          {/* Bloque de Firmas (Compactas en 2 columnas para 80mm) */}
          <div
            style={{
              marginTop: "10px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            {/* Firma Entrega */}
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #000000", height: "16px" }} />
              <div style={{ fontSize: "8px", fontWeight: 800, marginTop: "2px" }}>
                FIRMA ENTREGA
              </div>
              <div style={{ fontSize: "7px", color: "#333" }}>Cajero / Responsable</div>
            </div>

            {/* Firma Recibe */}
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #000000", height: "16px" }} />
              <div style={{ fontSize: "8px", fontWeight: 800, marginTop: "2px" }}>
                FIRMA RECIBE
              </div>
              <div
                style={{
                  fontSize: "7px",
                  color: "#333",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {outflow.beneficiaryName}
              </div>
            </div>
          </div>

          {/* Recuadro de Huella (Compacto) */}
          <div
            style={{
              marginTop: "5px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                width: "20mm",
                height: "22mm",
                border: "1px solid #000000",
                borderRadius: "3px",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: "2px",
                fontSize: "7px",
                fontWeight: 600,
                color: "#555",
                background: "#ffffff",
                boxSizing: "border-box",
              }}
            >
              Huella
            </div>
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

      {/* ESTILOS DE IMPRESIÓN PARA TIRILLA POS 80MM */}
      <style>{`
        @page {
          size: portrait;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 70mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-ticket, .printable-ticket * {
            visibility: visible !important;
          }
          .printable-ticket {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 70mm !important;
            max-width: 70mm !important;
            margin: 0 !important;
            padding: 2mm 2.5mm 4mm 2.5mm !important;
            box-sizing: border-box !important;
            color: #000000 !important;
            background: #ffffff !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          .print-modal-container {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
        }
      `}</style>
    </div>
  );
}
