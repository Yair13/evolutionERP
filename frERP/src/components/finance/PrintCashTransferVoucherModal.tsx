import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import type { CashTransferItem } from "../../api/finance.js";

type Props = {
  open: boolean;
  transfer: CashTransferItem | null;
  /** Si es true, el modal exige imprimir el voucher antes de permitir cerrarlo. */
  mandatory?: boolean;
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

const STATUS_LABELS: Record<string, string> = {
  pending: "EN TRÁNSITO (PENDIENTE RECEPCIÓN)",
  approved: "RECIBIDO EN CAJA DESTINO",
  rejected: "RECHAZADO · RETORNADO A ORIGEN",
  cancelled: "CANCELADO",
};

export function PrintCashTransferVoucherModal({
  open,
  transfer,
  mandatory = false,
  onClose,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove("inv-printing-transfer-ticket");
    };
  }, []);

  useEffect(() => {
    if (open) {
      setHasPrinted(false);
    }
  }, [open, transfer?.id]);

  const canClose = !mandatory || hasPrinted;

  function handlePrint() {
    setHasPrinted(true);
    document.body.classList.add("inv-printing-transfer-ticket");

    const cleanup = () => {
      document.body.classList.remove("inv-printing-transfer-ticket");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 100);
  }

  // Disparo automático de impresión cuando es obligatorio al crear el traslado
  useEffect(() => {
    if (open && portalReady && transfer && mandatory) {
      const timer = window.setTimeout(() => {
        handlePrint();
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [open, portalReady, transfer?.id, mandatory]);

  if (!open || !transfer) return null;

  // Tarjeta visual del ticket (70 mm de ancho para rollo POS de 80 mm)
  const renderTicketContent = () => (
    <div
      className="transfer-ticket-body"
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
        <div
          style={{
            fontSize: "10px",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            marginTop: "2px",
            color: "#000000",
          }}
        >
          VOUCHER DE TRASLADO DE DINERO
        </div>
        <div style={{ fontSize: "13px", fontWeight: 900, color: "#000000", marginTop: "1px" }}>
          {transfer.code}
        </div>
        <div style={{ fontSize: "8px", fontWeight: 700, color: "#000000", marginTop: "1px" }}>
          {STATUS_LABELS[transfer.status] || transfer.status.toUpperCase()}
        </div>
      </div>

      {/* Datos del Traslado */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "9.5px", color: "#000000" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Fecha Envío:</span>
          <span style={{ fontWeight: 600 }}>{formatDate(transfer.createdAt)}</span>
        </div>

        {transfer.approvedAt && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Fecha Recepción:</span>
            <span style={{ fontWeight: 600 }}>{formatDate(transfer.approvedAt)}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Sede Origen:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>
            {transfer.originWarehouseName} ({transfer.originWarehouseCode})
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Sede Destino:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>
            {transfer.destinationWarehouseName} ({transfer.destinationWarehouseCode})
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Medio Envío:</span>
          <span style={{ textTransform: "capitalize", fontWeight: 700 }}>
            {transfer.paymentMethod}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Transportador:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>{transfer.carrierName}</span>
        </div>

        {transfer.carrierDoc && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>C.C. / Doc:</span>
            <span>{transfer.carrierDoc}</span>
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
            {transfer.concept}
          </div>
        </div>
      </div>

      {/* Valor Trasladado Destacado */}
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
        <span style={{ fontSize: "9.5px", fontWeight: 800 }}>VALOR TRASLADADO:</span>
        <span style={{ fontSize: "14px", fontWeight: 900 }}>{formatMoney(transfer.amount)}</span>
      </div>

      {transfer.createdByName && (
        <div style={{ fontSize: "8px", color: "#000000", marginTop: "2px", textAlign: "right" }}>
          Despachado por: {transfer.createdByName}
        </div>
      )}
      {transfer.approvedByName && (
        <div style={{ fontSize: "8px", color: "#000000", marginTop: "1px", textAlign: "right" }}>
          Recibido por: {transfer.approvedByName}
        </div>
      )}

      {/* Bloque de Firmas (Entrega Sede Origen + Transportador + Recibe Sede Destino) */}
      <div
        style={{
          marginTop: "8px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        {/* Firma Entrega (Sede Origen) */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "18px" }} />
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
            {transfer.createdByName || "Responsable Origen"}
          </div>
          <div style={{ fontSize: "6.5px", color: "#000000" }}>
            {transfer.originWarehouseName}
          </div>
        </div>

        {/* Firma Transportador / Mensajero */}
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #000000", height: "18px" }} />
          <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
            FIRMA TRANSPORTADOR
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
            {transfer.carrierName}
          </div>
          {transfer.carrierDoc && (
            <div style={{ fontSize: "6.5px", color: "#000000" }}>C.C. {transfer.carrierDoc}</div>
          )}
        </div>
      </div>

      {/* Firma Sede Destino */}
      <div style={{ marginTop: "8px", textAlign: "center" }}>
        <div style={{ borderBottom: "1.5px solid #000000", height: "18px", width: "75%", margin: "0 auto" }} />
        <div style={{ fontSize: "7.5px", fontWeight: 800, marginTop: "2px" }}>
          FIRMA RECIBE (SEDE DESTINO)
        </div>
        <div style={{ fontSize: "7px", color: "#000000" }}>
          {transfer.approvedByName || `Responsable · ${transfer.destinationWarehouseName}`}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="inv-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (canClose) onClose();
      }}
    >
      <div
        className="inv-modal print-modal-container"
        role="dialog"
        aria-labelledby="print-transfer-voucher-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Printer size={20} color="#4f46e5" />
            <h2 id="print-transfer-voucher-title" className="inv-modal__title" style={{ fontSize: "1rem" }}>
              Voucher de Traslado de Dinero (80 mm)
            </h2>
          </div>
          {canClose && (
            <button
              type="button"
              className="inv-btn inv-btn--ghost inv-btn--icon"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {mandatory && (
          <div
            className="no-print"
            style={{
              margin: "0.75rem 1rem 0",
              padding: "0.65rem 0.85rem",
              borderRadius: 8,
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: hasPrinted ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.12)",
              border: hasPrinted
                ? "1px solid rgba(16, 185, 129, 0.35)"
                : "1px solid rgba(245, 158, 11, 0.35)",
              color: hasPrinted ? "#065f46" : "#92400e",
              fontWeight: 600,
            }}
          >
            {hasPrinted ? (
              <>
                <CheckCircle2 size={17} style={{ flexShrink: 0, color: "#059669" }} />
                <span>
                  Impresión enviada. Recuerda hacer firmar el voucher como soporte físico del traslado.
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={17} style={{ flexShrink: 0, color: "#d97706" }} />
                <span>
                  Es obligatorio imprimir este voucher como soporte de la operación para su firma.
                </span>
              </>
            )}
          </div>
        )}

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
        <div className="inv-modal__actions no-print" style={{ marginTop: "0.5rem" }}>
          {canClose && (
            <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
              Cerrar
            </button>
          )}
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={handlePrint}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Printer size={16} />
            {hasPrinted ? "Reimprimir Voucher (80 mm)" : "Imprimir Voucher para Firma (80 mm)"}
          </button>
        </div>
      </div>

      {/* PORTAL DE IMPRESIÓN DIRECTO EN BODY */}
      {portalReady
        ? createPortal(
            <div id="inv-transfer-ticket-print" aria-hidden="true">
              {renderTicketContent()}
            </div>,
            document.body
          )
        : null}

      {/* ESTILOS DE IMPRESIÓN DIRECTA */}
      <style>{`
        #inv-transfer-ticket-print {
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
          body.inv-printing-transfer-ticket {
            height: auto !important;
            min-height: 0 !important;
          }

          body.inv-printing-transfer-ticket > *:not(#inv-transfer-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* Muestra únicamente el contenedor de la tirilla en la raíz del documento */
          body.inv-printing-transfer-ticket #inv-transfer-ticket-print {
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

          body.inv-printing-transfer-ticket #inv-transfer-ticket-print .transfer-ticket-body {
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
