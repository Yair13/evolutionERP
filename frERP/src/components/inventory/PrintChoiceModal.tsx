import { CheckCircle2, FileText, Receipt, X } from "lucide-react";
import type { InventoryDocumentDetail } from "../../features/inventory/inventory.types.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  document: InventoryDocumentDetail;
  onSelectFormat: (format: "half_letter" | "voucher") => void;
  onClose: () => void;
};

export function PrintChoiceModal({ document: doc, onSelectFormat, onClose }: Props) {
  const isCredit =
    doc.exitKind === "credit" ||
    doc.metadata?.exitKind === "credit" ||
    Boolean(doc.receivable);

  return (
    <div className="inv-modal-backdrop print-choice-backdrop" role="presentation">
      <div
        className="inv-modal print-choice-modal"
        role="dialog"
        aria-labelledby="print-choice-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera de éxito */}
        <div className="print-choice-header">
          <div className="print-choice-icon-wrap" aria-hidden="true">
            <CheckCircle2 size={36} className="print-choice-success-icon" />
          </div>
          <h2 id="print-choice-title" className="print-choice-title">
            ¡Venta Registrada Exitosamente!
          </h2>
          <p className="print-choice-subtitle">
            Comprobante <strong>#{doc.invoiceNumber ?? "—"}</strong>
            {doc.warehouseName ? ` · Sede ${doc.warehouseName}` : ""}
          </p>
        </div>

        {/* Resumen rápido de la venta */}
        <div className="print-choice-summary">
          <div className="print-choice-summary-row">
            <span className="print-choice-summary-label">Cliente:</span>
            <strong className="print-choice-summary-val">
              {doc.customerName || "Consumidor Final"}
              {doc.customerTaxId ? ` (${doc.customerTaxId})` : ""}
            </strong>
          </div>
          <div className="print-choice-summary-row">
            <span className="print-choice-summary-label">Artículos:</span>
            <span className="print-choice-summary-val">{doc.totalQuantity} unidades</span>
          </div>
          {isCredit ? (
            <div className="print-choice-summary-row">
              <span className="print-choice-summary-label">Modalidad:</span>
              <strong className="print-choice-badge-credit">Venta a Crédito</strong>
            </div>
          ) : null}
          <div className="print-choice-summary-row print-choice-summary-total">
            <span>Total Venta:</span>
            <strong>{formatMoney(doc.totalAmount ?? 0)}</strong>
          </div>
        </div>

        {/* Pregunta del formato */}
        <div className="print-choice-prompt">
          <p className="print-choice-prompt-text">
            ¿En qué formato deseas imprimir el comprobante?
          </p>

          <div className="print-choice-cards">
            {/* Opción 1: Media Carta */}
            <button
              type="button"
              className="print-choice-card print-choice-card--half-letter"
              onClick={() => onSelectFormat("half_letter")}
            >
              <div className="print-choice-card-icon">
                <FileText size={32} />
              </div>
              <div className="print-choice-card-body">
                <div className="print-choice-card-top">
                  <h3 className="print-choice-card-name">Media Carta</h3>
                  <span className="print-choice-tag">Estándar</span>
                </div>
                <p className="print-choice-card-desc">
                  Hoja horizontal (8.5" × 5.5") para impresoras comunes (láser o tinta).
                </p>
                <span className="print-choice-card-action">
                  Imprimir Media Carta →
                </span>
              </div>
            </button>

            {/* Opción 2: Baucher / Tirilla POS */}
            <button
              type="button"
              className="print-choice-card print-choice-card--voucher"
              onClick={() => onSelectFormat("voucher")}
            >
              <div className="print-choice-card-icon">
                <Receipt size={32} />
              </div>
              <div className="print-choice-card-body">
                <div className="print-choice-card-top">
                  <h3 className="print-choice-card-name">Baucher / Tirilla</h3>
                  <span className="print-choice-tag print-choice-tag--pos">POS 80 mm</span>
                </div>
                <p className="print-choice-card-desc">
                  Tirilla continua compacta para impresoras térmicas de punto de venta.
                </p>
                <span className="print-choice-card-action">
                  Imprimir Baucher →
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer / Omitir */}
        <div className="print-choice-footer">
          <button
            type="button"
            className="inv-btn inv-btn--ghost print-choice-skip-btn"
            onClick={onClose}
          >
            <X size={16} />
            Continuar sin imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
