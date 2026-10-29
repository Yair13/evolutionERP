import { FileText, Printer, Receipt, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { InventoryDocumentDetail } from "../../features/inventory/inventory.types.js";
import { documentTypeLabel } from "../../features/inventory/document-labels.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";

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
  return formatBogotaDateTime(iso);
}

function eventLabel(status: string): string {
  if (status === "edited") return "Edición guardada";
  if (status === "edit_unlocked") return "Edición activada (motivo)";
  return status;
}

type Props = {
  document: InventoryDocumentDetail;
  initialFormat?: "half_letter" | "voucher";
  onClose: () => void;
};

export function DocumentInvoicePrint({ document: doc, initialFormat = "half_letter", onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [format, setFormat] = useState<"half_letter" | "voucher">(initialFormat);

  useEffect(() => {
    setFormat(initialFormat);
  }, [initialFormat]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    function clearPrintClass() {
      document.body.classList.remove("inv-print-invoice", "inv-print-voucher");
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
    let pageStyle = document.getElementById("inv-print-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-page-size";
      document.head.appendChild(pageStyle);
    }

    if (format === "voucher") {
      document.body.classList.remove("inv-print-invoice");
      document.body.classList.add("inv-print-voucher");
      pageStyle.textContent = "@page { size: auto; margin: 0mm; }";
    } else {
      document.body.classList.remove("inv-print-voucher");
      document.body.classList.add("inv-print-invoice");
      pageStyle.textContent = "@page { size: letter portrait; margin: 0.2in; }";
    }

    window.setTimeout(() => window.print(), 80);
  }

  const isEntry = doc.docType === "entry";
  const isAdjustment = doc.docType === "adjustment";
  const kind = documentTypeLabel(doc);
  const isCredit =
    doc.exitKind === "credit" ||
    doc.metadata?.exitKind === "credit" ||
    doc.metadata?.isCredit === true ||
    kind === "Crédito" ||
    Boolean(doc.receivable);
  const isPurchase = Boolean(
    doc.purchaseOrderCode || doc.entryType === "purchase" || doc.metadata?.entryType === "purchase"
  );
  const title = isAdjustment
    ? "Comprobante de ajuste de inventario"
    : isPurchase
      ? "Comprobante de entrada · Compra"
      : isEntry
        ? "Comprobante de entrada"
        : isCredit
          ? "Comprobante de salida · Venta a crédito"
          : "Comprobante de salida";
  const isOp = Boolean(
    doc.productionOrderCode || doc.entryType === "production_order" || doc.metadata?.entryType === "production_order"
  );
  const accent = isOp || isPurchase ? "op" : isEntry || isAdjustment ? "entry" : "exit";
  // Movimientos internos entre almacenes o ajustes de conteo: no se muestran valores de venta
  const internalExit =
    doc.exitKind === "distribution" || doc.exitKind === "transfer" || doc.exitKind === "return_to_factory";
  const showValues = !isEntry && !isAdjustment && !internalExit;
  const lineCount = doc.lines.length;
  const density =
    lineCount <= 3 ? "sparse" : lineCount <= 8 ? "cozy" : lineCount <= 16 ? "dense" : "packed";

  const paymentBreakdown: { method: string; amount: number }[] = Array.isArray(
    doc.metadata?.paymentBreakdown
  )
    ? doc.metadata.paymentBreakdown
    : doc.metadata?.paymentMethod
      ? [{ method: doc.metadata.paymentMethod, amount: doc.totalAmount ?? 0 }]
      : [];

  const breakdownPaidTotal = paymentBreakdown.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  const discountAmount = Number(doc.discountAmount ?? doc.metadata?.discountAmount ?? 0);
  const discountReason = doc.discountReason || doc.metadata?.discountReason || null;
  const subtotalAmount = doc.subtotalAmount ?? (doc.totalAmount != null ? doc.totalAmount + discountAmount : 0);

  const totalSaleAmount = doc.totalAmount ?? 0;
  const initialPaymentTotal =
    doc.receivable?.initialPayment != null
      ? doc.receivable.initialPayment
      : doc.metadata?.creditInitialPayment != null
        ? Number(doc.metadata.creditInitialPayment)
        : breakdownPaidTotal;

  const totalPaidToDate =
    doc.receivable?.paidAmount != null
      ? doc.receivable.paidAmount
      : initialPaymentTotal;

  const balancePending =
    doc.receivable?.balanceAmount != null
      ? doc.receivable.balanceAmount
      : doc.metadata?.creditBalance != null
        ? Number(doc.metadata.creditBalance)
        : Math.max(0, totalSaleAmount - initialPaymentTotal);

  const isFullyPaid = isCredit && balancePending <= 0.01;

  const renderVoucherContent = () => (
    <div className="sale-voucher-body">
      {/* Encabezado del Baucher */}
      <div className="sale-voucher-header">
        <div className="sale-voucher-logo-row">
          <img src={LOGO_SRC} alt="Evolution" className="sale-voucher-logo" width={34} height={34} />
          <div className="sale-voucher-company">
            <strong>EVOLUTION</strong>
            <span>COLCHONES S.A.S</span>
          </div>
        </div>
        <div className="sale-voucher-brand-sub">Documento interno · {kind}</div>
        <div className="sale-voucher-warehouse">
          SEDE: {doc.warehouseName?.toUpperCase() ?? "PRINCIPAL"}
          {doc.warehouseCode ? ` (${doc.warehouseCode})` : ""}
        </div>
        <div className="sale-voucher-doc-type">
          {internalExit
            ? "COMPROBANTE DE TRASLADO"
            : isAdjustment
              ? "COMPROBANTE DE AJUSTE"
              : isCredit
                ? "COMPROBANTE DE SALIDA · CRÉDITO"
                : "COMPROBANTE DE SALIDA / VENTA"}
        </div>
        <div className="sale-voucher-number">
          Nº {doc.invoiceNumber ?? "—"}
        </div>
        <div className="sale-voucher-date">
          {formatDate(doc.completedAt ?? doc.createdAt)}
        </div>
      </div>

      <div className="sale-voucher-divider" />

      {/* Datos del Cliente y Vendedor */}
      <div className="sale-voucher-section">
        {doc.customerName && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Cliente:</span>
            <span className="sale-voucher-val sale-voucher-val--bold">{doc.customerName}</span>
          </div>
        )}
        {doc.customerTaxId && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">C.C. / NIT:</span>
            <span className="sale-voucher-val">{doc.customerTaxId}</span>
          </div>
        )}
        {doc.customerPhone && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Teléfono:</span>
            <span className="sale-voucher-val">{doc.customerPhone}</span>
          </div>
        )}
        {doc.customerAddress && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Dirección:</span>
            <span className="sale-voucher-val">{doc.customerAddress}</span>
          </div>
        )}
        {doc.metadata?.destinationWarehouseName && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Destino:</span>
            <span className="sale-voucher-val">
              {doc.metadata.destinationWarehouseName} ({doc.metadata.destinationWarehouseCode})
            </span>
          </div>
        )}
        {doc.relatedInvoiceNumber && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Fac. Ref:</span>
            <span className="sale-voucher-val">{doc.relatedInvoiceNumber}</span>
          </div>
        )}
        {doc.createdByName && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Atendido por:</span>
            <span className="sale-voucher-val">{doc.createdByName}</span>
          </div>
        )}
      </div>

      <div className="sale-voucher-divider" />

      {/* Lista de Artículos */}
      <div className="sale-voucher-items">
        <div className="sale-voucher-items-head">
          <span>DESCRIPCIÓN / CANT</span>
          {showValues && <span>TOTAL</span>}
        </div>
        {doc.lines.map((line) => {
          const unit = line.unitSalePrice ?? 0;
          const sub = unit * line.quantity;
          return (
            <div key={line.id} className="sale-voucher-item">
              <div className="sale-voucher-item-main">
                <span className="sale-voucher-item-qty">{line.quantity}x</span>
                <span className="sale-voucher-item-name">{line.productName}</span>
              </div>
              <div className="sale-voucher-item-sub">
                <span className="sale-voucher-item-ref">Ref: {line.referenceCode}</span>
                {showValues && (
                  <span className="sale-voucher-item-prices">
                    {line.quantity > 1 ? `(${formatMoney(unit)}) ` : ""}
                    <strong>{formatMoney(sub)}</strong>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sale-voucher-divider" />

      {/* Totales y Liquidación */}
      <div className="sale-voucher-totals">
        <div className="sale-voucher-row">
          <span>Total Artículos:</span>
          <strong>{doc.totalQuantity} uds</strong>
        </div>

        {showValues && discountAmount > 0 && (
          <>
            <div className="sale-voucher-row">
              <span>Subtotal:</span>
              <span>{formatMoney(subtotalAmount)}</span>
            </div>
            <div className="sale-voucher-row sale-voucher-row--discount">
              <span>(-) Descuento {discountReason ? `(${discountReason})` : ""}:</span>
              <span>- {formatMoney(discountAmount)}</span>
            </div>
          </>
        )}

        {showValues && (
          <div className="sale-voucher-total-box">
            <span className="sale-voucher-total-label">TOTAL {discountAmount > 0 ? "NETO" : "VENTA"}:</span>
            <span className="sale-voucher-total-amount">{formatMoney(totalSaleAmount)}</span>
          </div>
        )}
      </div>

      {/* Pagos / Crédito */}
      {showValues && (
        <>
          <div className="sale-voucher-divider" />
          <div className="sale-voucher-payments">
            {isCredit ? (
              <div className="sale-voucher-credit-block">
                <div className="sale-voucher-credit-badge">MODALIDAD CRÉDITO</div>
                <div className="sale-voucher-row">
                  <span>Abono inicial recibido:</span>
                  <strong style={{ color: "#059669" }}>{formatMoney(initialPaymentTotal)}</strong>
                </div>
                {paymentBreakdown.length > 0 && (
                  <div className="sale-voucher-payment-breakdown">
                    {paymentBreakdown.map((p, i) => (
                      <div key={i} className="sale-voucher-breakdown-row">
                        <span>· {paymentMethodLabel(p.method)}:</span>
                        <span>{formatMoney(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {doc.receivable && doc.receivable.paidAmount > initialPaymentTotal && (
                  <div className="sale-voucher-row">
                    <span>Abonos acumulados a hoy:</span>
                    <span>{formatMoney(totalPaidToDate)}</span>
                  </div>
                )}
                <div className="sale-voucher-balance-box">
                  <span>SALDO ESTA FACTURA:</span>
                  <strong>{formatMoney(balancePending)}</strong>
                </div>
                {doc.customerTotalWarehouseDebt != null && doc.customerTotalWarehouseDebt > 0 && (
                  <div className="sale-voucher-balance-box" style={{ background: "#fef2f2", borderColor: "#fecaca", marginTop: "4px" }}>
                    <span style={{ color: "#991b1b" }}>CARTERA TOTAL EN ESTA SEDE:</span>
                    <strong style={{ color: "#b91c1c" }}>{formatMoney(doc.customerTotalWarehouseDebt)}</strong>
                  </div>
                )}
                {doc.receivable?.dueDate && (
                  <div className="sale-voucher-row" style={{ marginTop: "3px" }}>
                    <span>Fecha límite de pago:</span>
                    <strong>{doc.receivable.dueDate}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="sale-voucher-payment-block">
                <div className="sale-voucher-section-title">Medios de Pago:</div>
                {paymentBreakdown.length > 0 ? (
                  paymentBreakdown.map((p, i) => (
                    <div key={i} className="sale-voucher-row">
                      <span>{paymentMethodLabel(p.method)}:</span>
                      <strong>{formatMoney(Number(p.amount))}</strong>
                    </div>
                  ))
                ) : doc.metadata?.paymentMethod ? (
                  <div className="sale-voucher-row">
                    <span>{paymentMethodLabel(doc.metadata.paymentMethod)}:</span>
                    <strong>{formatMoney(doc.totalAmount ?? 0)}</strong>
                  </div>
                ) : (
                  <div className="sale-voucher-row">
                    <span>Pago:</span>
                    <strong>Contado</strong>
                  </div>
                )}
                {doc.customerTotalWarehouseDebt != null && doc.customerTotalWarehouseDebt > 0 && (
                  <div className="sale-voucher-balance-box" style={{ background: "#fef2f2", borderColor: "#fecaca", marginTop: "6px" }}>
                    <span style={{ color: "#991b1b" }}>CARTERA PENDIENTE EN ESTA SEDE:</span>
                    <strong style={{ color: "#b91c1c" }}>{formatMoney(doc.customerTotalWarehouseDebt)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Observaciones */}
      {doc.notes && (
        <>
          <div className="sale-voucher-divider" />
          <div className="sale-voucher-notes">
            <strong>Observaciones:</strong> {doc.notes}
          </div>
        </>
      )}

      {/* Firma si es a crédito */}
      {isCredit && (
        <div className="sale-voucher-signature">
          <div className="sale-voucher-signature-line" />
          <div className="sale-voucher-signature-name">FIRMA DEL CLIENTE / RECIBÍ CONFORME</div>
          <div className="sale-voucher-signature-sub">
            {doc.customerName || "Cliente"} {doc.customerTaxId ? `· C.C. ${doc.customerTaxId}` : ""}
          </div>
          <p className="sale-voucher-legal-text">
            Acepto las condiciones comerciales y el saldo pendiente estipulado en este comprobante.
          </p>
        </div>
      )}

      <div className="sale-voucher-divider" />

      {/* Pie del baucher */}
      <div className="sale-voucher-footer">
        <p className="sale-voucher-thanks">¡Gracias por su compra!</p>
        <p className="sale-voucher-footer-sub">
          Evolution Colchones S.A.S · Calidad y Confort
        </p>
        <p className="sale-voucher-footer-sub">
          Conserve este comprobante para trámites de soporte o garantía.
        </p>
      </div>
    </div>
  );

  const modal = (
    <div className="inv-modal-backdrop inv-invoice-backdrop" role="presentation">
      <div
        className={`inv-modal inv-modal--invoice ${format === "voucher" ? "inv-modal--voucher" : ""}`}
        role="dialog"
        aria-labelledby="invoice-title"
      >
        <div className="inv-invoice-actions no-print">
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden />
            Cerrar
          </button>

          {/* Selector de formato: Media Carta vs Baucher */}
          <div className="inv-print-format-toggle" role="group" aria-label="Formato de impresión">
            <button
              type="button"
              className={`inv-format-btn ${format === "half_letter" ? "is-active" : ""}`}
              onClick={() => setFormat("half_letter")}
              title="Formato media carta horizontal"
            >
              <FileText size={16} />
              <span>Media Carta</span>
            </button>
            <button
              type="button"
              className={`inv-format-btn ${format === "voucher" ? "is-active" : ""}`}
              onClick={() => setFormat("voucher")}
              title="Formato tirilla térmica de 80 mm"
            >
              <Receipt size={16} />
              <span>Baucher (80 mm)</span>
            </button>
          </div>

          <button type="button" className="inv-btn inv-btn--primary" onClick={print}>
            <Printer size={18} strokeWidth={2} aria-hidden />
            {format === "voucher" ? "Imprimir Baucher" : "Imprimir Media Carta"}
          </button>
        </div>

        {format === "voucher" ? (
          <div className="inv-voucher-preview-container">
            {renderVoucherContent()}
          </div>
        ) : (
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
              {isCredit ? (
                <div className="inv-invoice__meta-item">
                  <span>Modalidad</span>
                  <strong style={{ color: "#d97706" }}>Crédito</strong>
                </div>
              ) : null}
              {doc.productionOrderCode && doc.productionOrderCode !== doc.invoiceNumber ? (
                <div className="inv-invoice__meta-item">
                  <span>Orden Prod.</span>
                  <strong>{doc.productionOrderCode}</strong>
                </div>
              ) : null}
              {doc.purchaseOrderCode && doc.purchaseOrderCode !== doc.invoiceNumber ? (
                <div className="inv-invoice__meta-item">
                  <span>Orden Compra</span>
                  <strong>{doc.purchaseOrderCode}</strong>
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
              {isCredit ? (
                <div className="inv-invoice__payments">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "4px" }}>
                    <span className="inv-invoice__payments-label">
                      Abono inicial / Medios de pago
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669" }}>
                      Total abonado: {formatMoney(initialPaymentTotal)}
                    </span>
                  </div>
                  {paymentBreakdown.length > 0 ? (
                    <ul className="inv-invoice__payments-list">
                      {paymentBreakdown.map((payment, index) => (
                        <li key={`${payment.method}-${index}`}>
                          <strong>{paymentMethodLabel(payment.method)}</strong>
                          <span>{formatMoney(Number(payment.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                      Sin abono inicial ($ 0) · Crédito por el 100% del valor
                    </p>
                  )}
                </div>
              ) : paymentBreakdown.length > 0 ? (
                <div className="inv-invoice__payments">
                  <span className="inv-invoice__payments-label">Métodos de pago</span>
                  <ul className="inv-invoice__payments-list">
                    {paymentBreakdown.map((payment, index) => (
                      <li key={`${payment.method}-${index}`}>
                        <strong>{paymentMethodLabel(payment.method)}</strong>
                        <span>{formatMoney(Number(payment.amount))}</span>
                      </li>
                    ))}
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
                {!showValues ? (
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td>
                      <strong>{doc.totalQuantity} uds</strong>
                    </td>
                  </tr>
                ) : isCredit ? (
                  <>
                    {discountAmount > 0 && (
                      <>
                        <tr className="inv-invoice__row-credit-subtotal">
                          <td colSpan={4}>Subtotal ({doc.totalQuantity} uds)</td>
                          <td>
                            <strong>{formatMoney(subtotalAmount)}</strong>
                          </td>
                        </tr>
                        <tr className="inv-invoice__row-credit-paid">
                          <td colSpan={4}>
                            (-) Descuento comercial
                            {discountReason ? (
                              <span style={{ fontSize: "11px", fontWeight: "normal", marginLeft: "6px", color: "#64748b" }}>
                                ({discountReason})
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <strong style={{ color: "#dc2626" }}>
                              - {formatMoney(discountAmount)}
                            </strong>
                          </td>
                        </tr>
                      </>
                    )}
                    <tr className="inv-invoice__row-credit-subtotal">
                      <td colSpan={4}>Total venta neto ({doc.totalQuantity} uds)</td>
                      <td>
                        <strong>{formatMoney(totalSaleAmount)}</strong>
                      </td>
                    </tr>
                    <tr className="inv-invoice__row-credit-paid">
                      <td colSpan={4}>
                        (-) Abono inicial recibido
                        {doc.receivable && doc.receivable.paidAmount > initialPaymentTotal ? (
                          <span style={{ fontSize: "11px", fontWeight: "normal", marginLeft: "6px", color: "#059669" }}>
                            (Abonos acumulados a hoy: {formatMoney(totalPaidToDate)})
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <strong style={{ color: "#059669" }}>
                          - {formatMoney(initialPaymentTotal)}
                        </strong>
                      </td>
                    </tr>
                    <tr className="inv-invoice__row-credit-balance">
                      <td colSpan={4}>
                        <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 800 }}>
                          SALDO PENDIENTE (ESTA FACTURA)
                        </span>
                      </td>
                      <td>
                        <strong
                          style={{
                            color: balancePending > 0 ? "#dc2626" : "#059669",
                            fontSize: "1.15em",
                            fontWeight: 800,
                          }}
                        >
                          {formatMoney(balancePending)}
                        </strong>
                      </td>
                    </tr>
                    {doc.customerTotalWarehouseDebt != null && doc.customerTotalWarehouseDebt > 0 && (
                      <tr className="inv-invoice__row-credit-balance" style={{ background: "#fef2f2" }}>
                        <td colSpan={4}>
                          <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 800, color: "#991b1b" }}>
                            CARTERA TOTAL EN ESTA SEDE
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#b91c1c", fontSize: "1.15em", fontWeight: 800 }}>
                            {formatMoney(doc.customerTotalWarehouseDebt)}
                          </strong>
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  <>
                    {discountAmount > 0 && (
                      <>
                        <tr>
                          <td colSpan={4}>Subtotal ({doc.totalQuantity} uds)</td>
                          <td>
                            <strong>{formatMoney(subtotalAmount)}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={4}>
                            (-) Descuento comercial
                            {discountReason ? (
                              <span style={{ fontSize: "11px", fontWeight: "normal", marginLeft: "6px", color: "#64748b" }}>
                                ({discountReason})
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <strong style={{ color: "#dc2626" }}>
                              - {formatMoney(discountAmount)}
                            </strong>
                          </td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td colSpan={4}>Total {discountAmount > 0 ? "neto " : ""}({doc.totalQuantity} uds)</td>
                      <td>
                        <strong>{formatMoney(doc.totalAmount ?? 0)}</strong>
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>

          {isCredit ? (
            <section className="inv-invoice__credit-card" aria-label="Resumen de crédito">
              <div className="inv-invoice__credit-title-row">
                <span className="inv-invoice__credit-title">Resumen de cuenta por cobrar</span>
                <span className={`inv-invoice__credit-badge ${isFullyPaid ? "is-paid" : "is-pending"}`}>
                  {isFullyPaid ? "Crédito cancelado (Pagado)" : "Saldo pendiente de cobro"}
                </span>
              </div>
              <div className="inv-invoice__credit-stats">
                <div className="inv-invoice__credit-stat">
                  <span>Total venta</span>
                  <strong>{formatMoney(totalSaleAmount)}</strong>
                </div>
                <div className="inv-invoice__credit-stat">
                  <span>Abono inicial</span>
                  <strong className="is-paid-amount">{formatMoney(initialPaymentTotal)}</strong>
                </div>
                {doc.receivable && doc.receivable.paidAmount > initialPaymentTotal ? (
                  <div className="inv-invoice__credit-stat">
                    <span>Abonos acumulados</span>
                    <strong className="is-paid-amount">{formatMoney(totalPaidToDate)}</strong>
                  </div>
                ) : null}
                <div className="inv-invoice__credit-stat">
                  <span>Saldo esta factura</span>
                  <strong className={balancePending > 0 ? "is-balance" : "is-paid-amount"}>
                    {formatMoney(balancePending)}
                  </strong>
                </div>
                {doc.customerTotalWarehouseDebt != null && doc.customerTotalWarehouseDebt > 0 && (
                  <div className="inv-invoice__credit-stat" style={{ borderLeft: "2px solid #e11d48", paddingLeft: "8px" }}>
                    <span style={{ color: "#991b1b" }}>Cartera total en sede</span>
                    <strong style={{ color: "#b91c1c" }}>
                      {formatMoney(doc.customerTotalWarehouseDebt)}
                    </strong>
                  </div>
                )}
                {doc.receivable?.dueDate ? (
                  <div className="inv-invoice__credit-stat">
                    <span>Fecha límite</span>
                    <strong>{doc.receivable.dueDate}</strong>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

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
        )}
      </div>
    </div>
  );

  return portalReady ? (
    <>
      {createPortal(modal, document.body)}
      {createPortal(
        <div id="inv-sale-voucher-print" aria-hidden="true">
          {renderVoucherContent()}
        </div>,
        document.body
      )}
    </>
  ) : null;
}
