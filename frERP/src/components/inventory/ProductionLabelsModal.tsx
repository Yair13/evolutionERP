import JsBarcode from "jsbarcode";
import { Printer, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { markLabelsPrinted } from "../../api/inventory.js";
import type { InventoryDocumentDetail } from "../../features/inventory/inventory.types.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

type LabelItem = {
  barcode: string;
  name: string;
  referenceCode: string;
  quantity: number;
};

type Props = {
  document: InventoryDocumentDetail;
  token: string;
  warehouseId?: string | null;
  onClose: () => void;
  onPrinted: (updated: InventoryDocumentDetail) => void;
};

const BARCODE_PRINT = {
  format: "CODE128" as const,
  width: 2.4,
  height: 70,
  displayValue: false,
  margin: 2,
};

function renderBarcode(svg: SVGSVGElement | null, value: string) {
  if (!svg || !value) return;
  try {
    JsBarcode(svg, value, BARCODE_PRINT);
  } catch {
    /* ignore */
  }
}

export function ProductionLabelsModal({ document: doc, token, warehouseId, onClose, onPrinted }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const alreadyPrinted = Boolean(doc.labelsPrintedAt ?? doc.metadata?.labelsPrintedAt);
  const orderCode = doc.productionOrderCode || doc.invoiceNumber || "—";
  const dateLabel = doc.completedAt
    ? doc.completedAt.slice(0, 10)
    : new Date().toLocaleDateString("es-CO");

  const labelItems = useMemo<LabelItem[]>(
    () =>
      doc.lines
        .filter((l) => Boolean(l.barcode))
        .map((l) => ({
          barcode: l.barcode!,
          name: l.productName,
          referenceCode: l.referenceCode,
          quantity: Math.max(1, Math.floor(Math.abs(l.quantity))),
        })),
    [doc.lines]
  );

  const totalLabels = labelItems.reduce((s, i) => s + i.quantity, 0);
  const withoutBarcode = doc.lines.filter((l) => !l.barcode).length;

  async function handlePrint() {
    if (alreadyPrinted || printing || labelItems.length === 0) return;
    setPrinting(true);
    setError(null);

    document.body.classList.remove("inv-print-invoice");
    document.body.classList.add("inv-print-barcode-label");

    const clear = () => {
      document.body.classList.remove("inv-print-barcode-label");
    };

    const finish = async () => {
      clear();
      try {
        const { item } = await markLabelsPrinted(token, doc.id, warehouseId);
        onPrinted(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        if (msg === "labels_already_printed") {
          setError("Las etiquetas de esta orden ya fueron impresas.");
        } else {
          setError(msg === "not_a_production_order" ? "Este documento no es una orden de producción." : msg);
        }
      } finally {
        setPrinting(false);
      }
    };

    window.addEventListener("afterprint", () => void finish(), { once: true });
    window.setTimeout(() => window.print(), 80);
  }

  const sheets = labelItems.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, copyIdx) => ({
      key: `${item.barcode}-${copyIdx}`,
      ...item,
    }))
  );

  const printSheet = (
    <div className="inv-barcode-print-container" id="inv-barcode-label-print">
      {sheets.map((sheet) => (
        <article key={sheet.key} className="inv-barcode-sheet" aria-label="Etiqueta adhesiva">
          <header
            className="inv-barcode-sheet__brand"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              borderBottom: "2px solid #0d9488",
              paddingBottom: "4px",
              marginBottom: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src={LOGO_SRC} alt="" className="inv-barcode-sheet__logo" width={40} height={40} />
              <div className="inv-barcode-sheet__brand-text">
                <strong style={{ fontSize: "14px", color: "#0f766e" }}>Evolution</strong>
                <span style={{ fontSize: "9px", color: "#64748b", textTransform: "uppercase" }}>
                  Colchones S.A.S
                </span>
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "#475569", fontWeight: "bold" }}>Fecha: {dateLabel}</div>
          </header>
          <div className="inv-barcode-sheet__body" style={{ marginBottom: "8px" }}>
            <p
              className="inv-barcode-sheet__name"
              style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}
            >
              {sheet.name}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#475569",
                margin: "0 0 4px",
              }}
            >
              <span>Ref: {sheet.referenceCode || "—"}</span>
            </div>
            <p style={{ margin: "0 0 6px", fontSize: "12px", fontWeight: "bold", color: "#0f172a" }}>
              Orden Prod: {orderCode}
            </p>
          </div>
          <div className="inv-barcode-sheet__code" style={{ textAlign: "center" }}>
            <svg
              ref={(svg) => renderBarcode(svg, sheet.barcode)}
              role="img"
              aria-hidden
              style={{ display: "block", margin: "0 auto", maxWidth: "90%" }}
            />
            <p
              className="inv-barcode-sheet__digits"
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                letterSpacing: "0.12em",
                marginTop: "4px",
                color: "#334155",
              }}
            >
              {sheet.barcode}
            </p>
          </div>
        </article>
      ))}
    </div>
  );

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal"
        role="dialog"
        aria-labelledby="op-labels-title"
        style={{ width: "min(520px, calc(100vw - 32px))", maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 id="op-labels-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Tag size={20} strokeWidth={2} aria-hidden />
              Etiquetas de OP
            </h2>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
              {orderCode} · {totalLabels} etiqueta{totalLabels === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" className="inv-btn inv-btn--ghost sm" onClick={onClose} aria-label="Cerrar">
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {alreadyPrinted ? (
          <p className="form-error" role="status" style={{ marginTop: 14 }}>
            Las etiquetas de esta orden ya fueron impresas
            {doc.labelsPrintedAt
              ? ` el ${new Date(doc.labelsPrintedAt).toLocaleString("es-CO")}`
              : ""}
            . Solo se pueden generar una vez.
          </p>
        ) : null}

        {error ? (
          <p className="form-error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        ) : null}

        {labelItems.length === 0 ? (
          <p style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
            Esta orden no tiene productos con código de barras. No hay etiquetas para imprimir.
          </p>
        ) : (
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {labelItems.map((item) => (
              <li
                key={item.barcode}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 13 }}>{item.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {item.referenceCode} · {item.barcode}
                  </span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>×{item.quantity}</span>
              </li>
            ))}
          </ul>
        )}

        {withoutBarcode > 0 ? (
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            {withoutBarcode} producto{withoutBarcode === 1 ? "" : "s"} sin código · sin etiqueta.
          </p>
        ) : null}

        <div className="inv-modal__actions" style={{ marginTop: 18 }}>
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose} disabled={printing}>
            Cerrar
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            disabled={alreadyPrinted || printing || labelItems.length === 0}
            title={
              alreadyPrinted
                ? "Ya fueron impresas"
                : labelItems.length === 0
                  ? "Sin productos con código"
                  : "Imprimir etiquetas"
            }
            onClick={() => void handlePrint()}
          >
            <Printer size={16} strokeWidth={2} aria-hidden />
            {printing ? "Imprimiendo…" : alreadyPrinted ? "Ya impresas" : `Imprimir ${totalLabels}`}
          </button>
        </div>
      </div>

      {portalReady && sheets.length > 0 ? createPortal(printSheet, document.body) : null}
    </div>
  );
}
