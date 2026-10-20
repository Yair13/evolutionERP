import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, Tag } from "lucide-react";
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
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove("inv-print-egress-voucher");
    };
  }, []);

  if (!open || !outflow) return null;

  function handlePrint() {
    document.body.classList.add("inv-print-egress-voucher");
    const cleanup = () => {
      document.body.classList.remove("inv-print-egress-voucher");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    // Pequeño timeout para asegurar que el navegador aplique los estilos antes del diálogo
    window.setTimeout(() => {
      window.print();
      // Respaldo por si el evento afterprint no dispara en algunos navegadores
      window.setTimeout(cleanup, 1000);
    }, 80);
  }

  // Componente de contenido del Comprobante (Medida exacta: 100mm × 70mm)
  const renderVoucherCard = (isPrint: boolean) => (
    <article
      className="inv-voucher-sheet"
      style={{
        width: isPrint ? "100mm" : "100%",
        maxWidth: isPrint ? "100mm" : "390px",
        height: isPrint ? "68mm" : "auto",
        minHeight: isPrint ? undefined : "260px",
        maxHeight: isPrint ? "68mm" : undefined,
        padding: isPrint ? "2.5mm 3.5mm" : "14px 16px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
        color: "#000000",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        lineHeight: 1.2,
        borderRadius: isPrint ? "0px" : "8px",
        border: isPrint ? "none" : "1px solid #cbd5e1",
        boxShadow: isPrint ? "none" : "0 4px 12px rgba(15, 23, 42, 0.08)",
        margin: "0 auto",
      }}
    >
      {/* Encabezado */}
      <header
        style={{
          borderBottom: "1.5px dashed #000000",
          paddingBottom: "3px",
          marginBottom: "4px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <strong
              style={{
                fontSize: isPrint ? "11.5px" : "13px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontWeight: 900,
              }}
            >
              Evolution ERP
            </strong>
            <span style={{ fontSize: isPrint ? "8.5px" : "9.5px", fontWeight: 700, color: "#222" }}>
              SEDE: {outflow.warehouseName.toUpperCase()} ({outflow.warehouseCode})
            </span>
          </div>
          <div
            style={{
              fontSize: isPrint ? "12px" : "14px",
              fontWeight: 900,
              letterSpacing: "0.02em",
              color: "#000",
            }}
          >
            {outflow.voucherNumber}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1px",
          }}
        >
          <span
            style={{
              fontSize: isPrint ? "8.5px" : "10px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            COMPROBANTE DE EGRESO
          </span>
          <span style={{ fontSize: isPrint ? "7.5px" : "9px", fontWeight: 600, color: "#333" }}>
            {formatDate(outflow.createdAt)}
          </span>
        </div>
      </header>

      {/* Datos del Egreso */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2.5px",
          fontSize: isPrint ? "8px" : "9.5px",
          color: "#000",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "70%",
            }}
          >
            <span style={{ fontWeight: 600 }}>Pagado a: </span>
            <strong style={{ fontWeight: 800 }}>{outflow.beneficiaryName}</strong>
            {outflow.beneficiaryDoc ? ` (CC: ${outflow.beneficiaryDoc})` : ""}
          </div>
          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 600 }}>Medio: </span>
            <strong style={{ textTransform: "capitalize" }}>{outflow.paymentMethod}</strong>
          </div>
        </div>

        {(outflow.supplierName || outflow.billNumber || outflow.referenceCode) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: isPrint ? "7.5px" : "8.5px",
              color: "#222",
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "60%",
              }}
            >
              {outflow.supplierName && (
                <span>
                  <strong>Prov:</strong> {outflow.supplierName}
                </span>
              )}
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              {outflow.billNumber && (
                <span style={{ marginRight: "6px" }}>
                  <strong>Doc/Fac:</strong> {outflow.billNumber}
                </span>
              )}
              {outflow.referenceCode && (
                <span>
                  <strong>Ref:</strong> {outflow.referenceCode}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "4px" }}>
          <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>Concepto:</span>
          <span
            style={{
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: isPrint ? "78mm" : "290px",
            }}
          >
            {outflow.concept}
          </span>
        </div>

        {outflow.notes && (
          <div
            style={{
              fontSize: isPrint ? "7px" : "8.5px",
              color: "#444",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <strong>Obs:</strong> {outflow.notes}
          </div>
        )}
      </div>

      {/* Total Destacado */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: isPrint ? "2px 6px" : "4px 8px",
          background: "#f1f5f9",
          border: "1.5px solid #000000",
          borderRadius: "3px",
          margin: "2px 0",
        }}
      >
        <span style={{ fontSize: isPrint ? "9px" : "11px", fontWeight: 800 }}>
          VALOR PAGADO:
        </span>
        <span style={{ fontSize: isPrint ? "12.5px" : "14.5px", fontWeight: 900 }}>
          {formatMoney(outflow.amount)}
        </span>
        {outflow.createdByName && (
          <span style={{ fontSize: isPrint ? "6.5px" : "8px", color: "#444" }}>
            Exp: {outflow.createdByName}
          </span>
        )}
      </div>

      {/* Firmas y Huella */}
      <footer
        style={{
          display: "grid",
          gridTemplateColumns: isPrint ? "1fr 1fr 18mm" : "1fr 1fr 68px",
          gap: isPrint ? "5mm" : "12px",
          alignItems: "flex-end",
          marginTop: "auto",
          paddingTop: "2px",
        }}
      >
        {/* Firma Entrega */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              borderBottom: "1px solid #000000",
              height: isPrint ? "14px" : "18px",
              marginBottom: "2px",
            }}
          />
          <div style={{ fontSize: isPrint ? "7px" : "8.5px", fontWeight: 800 }}>
            FIRMA ENTREGA
          </div>
          <div style={{ fontSize: isPrint ? "6.5px" : "7.5px", color: "#333" }}>
            Cajero / Responsable
          </div>
        </div>

        {/* Firma Recibe */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              borderBottom: "1px solid #000000",
              height: isPrint ? "14px" : "18px",
              marginBottom: "2px",
            }}
          />
          <div style={{ fontSize: isPrint ? "7px" : "8.5px", fontWeight: 800 }}>
            FIRMA RECIBE
          </div>
          <div
            style={{
              fontSize: isPrint ? "6.5px" : "7.5px",
              color: "#333",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {outflow.beneficiaryName}
          </div>
        </div>

        {/* Recuadro para Huella Dactilar */}
        <div
          style={{
            width: isPrint ? "18mm" : "68px",
            height: isPrint ? "18mm" : "68px",
            border: "1px solid #000000",
            borderRadius: "2px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: "1.5px",
            fontSize: isPrint ? "6.5px" : "8px",
            fontWeight: 600,
            color: "#555",
            background: "#ffffff",
            boxSizing: "border-box",
          }}
        >
          Huella
        </div>
      </footer>
    </article>
  );

  // Portal de impresión en el body
  const printSheetPortal = (
    <div className="inv-egress-voucher-print-container" id="inv-egress-voucher-print">
      {renderVoucherCard(true)}
    </div>
  );

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="print-voucher-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="inv-modal__header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Printer size={20} color="#0d9488" />
            <h2 id="print-voucher-title" className="inv-modal__title">
              Comprobante de Egreso
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
        <div className="inv-modal__body no-print" style={{ padding: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.78rem",
              color: "#0f766e",
              background: "#f0fdfa",
              border: "1px solid #ccfbf1",
              borderRadius: "6px",
              padding: "6px 10px",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            <Tag size={15} />
            <span>Formato configurado para Etiqueta Térmica: <strong>100 × 70 mm (10 × 7 cm)</strong></span>
          </div>

          {renderVoucherCard(false)}
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
            Imprimir en Etiqueta (100x70)
          </button>
        </div>
      </div>

      {/* Portal de Impresión */}
      {portalReady ? createPortal(printSheetPortal, document.body) : null}
    </div>
  );
}
