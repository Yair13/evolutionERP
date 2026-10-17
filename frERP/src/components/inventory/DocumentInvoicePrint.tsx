import { Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { InventoryDocumentDetail } from "../../features/inventory/inventory.types.js";
import { documentTypeLabel } from "../../features/inventory/document-labels.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    efectivo: "Efectivo",
    nequi: "Nequi",
    bancolombia: "Bancolombia",
    davivienda: "Davivienda",
    daviplata: "Daviplata",
    addi: "Addi",
    sistecredito: "Sistecrédito",
    bold: "Bold",
  };
  return labels[method] ?? method;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function eventLabel(status: string): string {
  if (status === "edited") return "Edición guardada";
  if (status === "edit_unlocked") return "Edición activada (motivo)";
  return status;
}

type Props = {
  document: InventoryDocumentDetail;
  onClose: () => void;
};

export function DocumentInvoicePrint({ document: doc, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    function clearPrintClass() {
      document.body.classList.remove("inv-print-invoice");
      document.getElementById("inv-print-page-size")?.remove();
    }
    window.addEventListener("afterprint", clearPrintClass);
    return () => {
      window.removeEventListener("afterprint", clearPrintClass);
      clearPrintClass();
    };
  }, []);

  function print() {
    document.body.classList.remove("inv-print-barcode-label");
    document.body.classList.add("inv-print-invoice");
    let pageStyle = document.getElementById("inv-print-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-page-size";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = "@page { size: 8.5in 5.5in; margin: 0.2in; }";
    window.setTimeout(() => window.print(), 80);
  }

  const isEntry = doc.docType === "entry";
  const isAdjustment = doc.docType === "adjustment";
  const kind = documentTypeLabel(doc);
  const title = isAdjustment
    ? "Comprobante de ajuste de inventario"
    : isEntry
      ? "Comprobante de entrada"
      : "Comprobante de salida";
  const isOp = Boolean(
    doc.productionOrderCode || doc.entryType === "production_order" || doc.metadata?.entryType === "production_order"
  );
  const accent = isOp ? "op" : isEntry || isAdjustment ? "entry" : "exit";
  // Movimientos internos entre almacenes o ajustes de conteo: no se muestran valores de venta
  const internalExit =
    doc.exitKind === "distribution" || doc.exitKind === "transfer" || doc.exitKind === "return_to_factory";
  const showValues = !isEntry && !isAdjustment && !internalExit;
  const lineCount = doc.lines.length;
  const density =
    lineCount <= 3 ? "sparse" : lineCount <= 8 ? "cozy" : lineCount <= 16 ? "dense" : "packed";

  const modal = (
    <div className="inv-modal-backdrop inv-invoice-backdrop" role="presentation">
      <div className="inv-modal inv-modal--invoice" role="dialog" aria-labelledby="invoice-title">
        <div className="inv-invoice-actions no-print">
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden />
            Cerrar
          </button>
          <button type="button" className="inv-btn inv-btn--primary" onClick={print}>
            <Printer size={18} strokeWidth={2} aria-hidden />
            Imprimir
          </button>
        </div>

        <article
          className={`inv-invoice inv-invoice--${accent} inv-invoice--density-${density}`}
          id="inv-invoice-print"
          data-lines={lineCount}
        >
          {doc.status === "cancelled" ? (
            <div className="inv-invoice__cancelled">COMPROBANTE ANULADO / INACTIVO</div>
          ) : null}

          <header className="inv-invoice__banner">
            <div className="inv-invoice__brand-row">
              <img src={LOGO_SRC} alt="Evolution" className="inv-invoice__logo" width={40} height={40} />
              <div>
                <p className="inv-invoice__brand">Evolution · Colchones S.A.S</p>
                <p className="inv-invoice__brand-sub">Documento interno · {kind}</p>
              </div>
            </div>
          </header>

          <div className="inv-invoice__head">
            <h1 id="invoice-title" className="inv-invoice__title">
              {title}
            </h1>
            <div className="inv-invoice__meta-row">
              <div className="inv-invoice__meta-item">
                <span>{internalExit ? "Código" : "Nº comprobante"}</span>
                <strong style={internalExit ? { fontSize: "1.35em", letterSpacing: "0.04em" } : undefined}>
                  {doc.invoiceNumber ?? "—"}
                </strong>
              </div>
              <div className="inv-invoice__meta-item">
                <span>Fecha</span>
                <strong>{formatDate(doc.completedAt ?? doc.createdAt)}</strong>
              </div>
              {doc.productionOrderCode && doc.productionOrderCode !== doc.invoiceNumber ? (
                <div className="inv-invoice__meta-item">
                  <span>Orden Prod.</span>
                  <strong>{doc.productionOrderCode}</strong>
                </div>
              ) : null}
            </div>
            {internalExit ? (
              <p className="inv-invoice__code-hint" style={{ margin: "6px 0 0", fontSize: "11px", color: "#475569" }}>
                Código de recepción · una sola vez · solo en la sede de destino
              </p>
            ) : null}
          </div>

          <section className="inv-invoice__party">
            <div className="inv-invoice__party-card">
              <p>
                <span>Sede</span> <strong>{doc.warehouseName ?? "—"}</strong>
                {doc.warehouseCode ? ` (${doc.warehouseCode})` : ""}
              </p>
              {doc.customerName ? (
                <p>
                  <span>Cliente</span> <strong>{doc.customerName}</strong>
                </p>
              ) : null}
              {doc.customerTaxId ? (
                <p>
                  <span>Cédula/NIT</span> <strong>{doc.customerTaxId}</strong>
                </p>
              ) : null}
              {doc.customerPhone ? (
                <p>
                  <span>Teléfono</span> <strong>{doc.customerPhone}</strong>
                </p>
              ) : null}
              {doc.customerAddress ? (
                <p>
                  <span>Dirección</span> <strong>{doc.customerAddress}</strong>
                </p>
              ) : null}
              {doc.metadata?.destinationWarehouseName ? (
                <p>
                  <span>Sede destino</span>{" "}
                  <strong>
                    {doc.metadata.destinationWarehouseName} ({doc.metadata.destinationWarehouseCode})
                  </strong>
                </p>
              ) : null}
              {doc.relatedInvoiceNumber ? (
                <p>
                  <span>Factura referencia</span> <strong>{doc.relatedInvoiceNumber}</strong>
                </p>
              ) : null}
              {doc.createdByName ? (
                <p>
                  <span>Registrado por</span> <strong>{doc.createdByName}</strong>
                </p>
              ) : null}
              {Array.isArray(doc.metadata?.paymentBreakdown) &&
              doc.metadata.paymentBreakdown.length > 0 ? (
                <div className="inv-invoice__payments">
                  <span className="inv-invoice__payments-label">Métodos de pago</span>
                  <ul className="inv-invoice__payments-list">
                    {doc.metadata.paymentBreakdown.map(
                      (payment: { method: string; amount: number }, index: number) => (
                        <li key={`${payment.method}-${index}`}>
                          <strong>{paymentMethodLabel(payment.method)}</strong>
                          <span>{formatMoney(Number(payment.amount))}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ) : doc.metadata?.paymentMethod ? (
                <p>
                  <span>Método de pago</span>{" "}
                  <strong>{paymentMethodLabel(doc.metadata.paymentMethod)}</strong>
                </p>
              ) : null}
            </div>
          </section>

          <div className="inv-invoice__table-wrap">
            <table className="inv-invoice__table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Producto</th>
                  <th>Cant.</th>
                  {showValues ? (
                    <>
                      <th>P. unit.</th>
                      <th>Subtotal</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line) => {
                  const unit = line.unitSalePrice ?? 0;
                  const sub = unit * line.quantity;
                  return (
                    <tr key={line.id}>
                      <td>{line.referenceCode}</td>
                      <td>{line.productName}</td>
                      <td>{line.quantity}</td>
                      {showValues ? (
                        <>
                          <td>{formatMoney(unit)}</td>
                          <td>{formatMoney(sub)}</td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  {!showValues ? (
                    <>
                      <td colSpan={2}>Total</td>
                      <td>
                        <strong>{doc.totalQuantity} uds</strong>
                      </td>
                    </>
                  ) : (
                    <>
                      <td colSpan={4}>Total ({doc.totalQuantity} uds)</td>
                      <td>
                        <strong>{formatMoney(doc.totalAmount ?? 0)}</strong>
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          {doc.notes ? (
            <p className="inv-invoice__notes">
              <span>Notas:</span> {doc.notes}
            </p>
          ) : null}

          {doc.events &&
          doc.events.some((e) => e.status === "edited" || e.status === "edit_unlocked") ? (
            <section className="inv-invoice__history no-print" aria-label="Auditoría de ediciones">
              <h2>Registro de auditoría</h2>
              <ol className="inv-invoice__events">
                {doc.events
                  .filter((e) => e.status === "edited" || e.status === "edit_unlocked")
                  .map((e) => (
                    <li key={e.id}>
                      <p className="inv-invoice__event-type">{eventLabel(e.status)}</p>
                      {e.comment ? <p className="inv-invoice__event-comment">{e.comment}</p> : null}
                      <p className="inv-invoice__event-meta">
                        {formatDate(e.createdAt)}
                        {e.actorName ? ` · ${e.actorName}` : ""}
                      </p>
                    </li>
                  ))}
              </ol>
            </section>
          ) : null}

          <footer className="inv-invoice__foot">
            <p>Evolution ERP · Documento interno · Media hoja carta</p>
          </footer>
        </article>
      </div>
    </div>
  );

  return portalReady ? createPortal(modal, document.body) : null;
}
