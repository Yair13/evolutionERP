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
  return formatBogotaDateTime(iso, { dateStyle: "long", timeStyle: "short" });
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
        style={{ maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Printer size={20} color="#6366f1" />
            <h2 id="print-voucher-title" className="inv-modal__title">
              Voucher de Comprobante de Egreso
            </h2>
          </div>
          <button
            type="button"
            className="inv-btn inv-btn--ghost inv-btn--icon"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* CONTENIDO DEL COMPROBANTE IMPRIMIBLE */}
        <div className="inv-modal__body printable-voucher" style={{ padding: "1.5rem" }}>
          {/* Encabezado */}
          <div style={{ textAlign: "center", borderBottom: "2px dashed #000", paddingBottom: "1rem", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Evolution ERP
            </h2>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginTop: "0.2rem" }}>
              SEDE: {outflow.warehouseName.toUpperCase()} ({outflow.warehouseCode})
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.6rem", color: "#111" }}>
              COMPROBANTE DE EGRESO
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6366f1" }}>
              {outflow.voucherNumber}
            </div>
          </div>

          {/* Datos del Egreso */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem", color: "#222" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600 }}>Fecha y Hora:</span>
              <span>{formatDate(outflow.createdAt)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600 }}>Pagado a (Persona):</span>
              <span style={{ fontWeight: 700 }}>{outflow.beneficiaryName}</span>
            </div>

            {outflow.beneficiaryDoc && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>C.C. / Documento:</span>
                <span>{outflow.beneficiaryDoc}</span>
              </div>
            )}

            {outflow.supplierName && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Proveedor Asociado:</span>
                <span>{outflow.supplierName} {outflow.supplierTaxId ? `(NIT: ${outflow.supplierTaxId})` : ""}</span>
              </div>
            )}

            {outflow.billNumber && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Factura / Remisión:</span>
                <span>{outflow.billNumber}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600 }}>Medio de Salida:</span>
              <span style={{ textTransform: "capitalize", fontWeight: 700 }}>{outflow.paymentMethod}</span>
            </div>

            {outflow.referenceCode && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Ref. Transacción:</span>
                <span>{outflow.referenceCode}</span>
              </div>
            )}

            <div style={{ borderTop: "1px solid #ddd", paddingTop: "0.5rem", marginTop: "0.2rem" }}>
              <span style={{ fontWeight: 600 }}>Por Concepto de:</span>
              <div style={{ marginTop: "0.2rem", fontStyle: "italic", background: "#f8fafc", padding: "6px 8px", borderRadius: 4 }}>
                {outflow.concept}
              </div>
            </div>

            {outflow.notes && (
              <div style={{ fontSize: "0.82rem", color: "#555" }}>
                <strong>Observaciones:</strong> {outflow.notes}
              </div>
            )}

            {/* Total destacado */}
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem 1rem",
                border: "2px solid #000",
                borderRadius: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f1f5f9",
              }}
            >
              <span style={{ fontSize: "1rem", fontWeight: 800 }}>VALOR PAGADO:</span>
              <span style={{ fontSize: "1.35rem", fontWeight: 900 }}>{formatMoney(outflow.amount)}</span>
            </div>

            {outflow.createdByName && (
              <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem", textAlign: "right" }}>
                Expedido por: {outflow.createdByName}
              </div>
            )}
          </div>

          {/* Espacio para Firmas (Efectivo / Recibido) */}
          <div
            style={{
              marginTop: "2.5rem",
              paddingTop: "1rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
            }}
          >
            {/* Firma Entrega */}
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #000", width: "100%", height: 40 }} />
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginTop: "0.3rem" }}>
                FIRMA ENTREGA
              </div>
              <div style={{ fontSize: "0.75rem", color: "#444" }}>
                Cajero / Responsable Sede
              </div>
              <div style={{ fontSize: "0.75rem", color: "#444" }}>
                C.C. _____________________
              </div>
            </div>

            {/* Firma Recibe */}
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #000", width: "100%", height: 40 }} />
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginTop: "0.3rem" }}>
                FIRMA RECIBE EFECTIVO
              </div>
              <div style={{ fontSize: "0.75rem", color: "#444" }}>
                Beneficiario: {outflow.beneficiaryName}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#444" }}>
                C.C. {outflow.beneficiaryDoc || "_____________________"}
              </div>
            </div>
          </div>

          {/* Recuadro para Huella Dactilar */}
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                width: 75,
                height: 90,
                border: "1px solid #999",
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingBottom: 4,
                fontSize: "0.68rem",
                color: "#666",
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
            Imprimir Voucher
          </button>
        </div>
      </div>

      {/* ESTILOS DE IMPRESIÓN */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .printable-voucher, .printable-voucher * {
            visibility: visible !important;
          }
          .printable-voucher {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 480px !important;
            padding: 10px !important;
            color: #000 !important;
            background: #fff !important;
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
