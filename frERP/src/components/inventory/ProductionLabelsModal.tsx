import JsBarcode from "jsbarcode";
import { Printer, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markLabelsPrinted } from "../../api/inventory.js";
import type { InventoryDocumentDetail } from "../../features/inventory/inventory.types.js";
import { formatBogotaDate } from "../../lib/dateUtils.js";

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

function BarcodeCanvas({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    try {
      JsBarcode(canvasRef.current, value, {
        format: "CODE128",
        width: 2,
        height: 48,
        displayValue: true,
        font: "monospace",
        fontSize: 13,
        fontOptions: "bold",
        textMargin: 3,
        margin: 4,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (e) {
      console.error("Barcode render error:", e);
    }
  }, [value]);

  return (
    <canvas
      ref={canvasRef}
      className="inv-barcode-sheet__canvas"
      style={{
        display: "block",
        margin: "0 auto",
        maxWidth: "100%",
        maxHeight: "24mm",
        height: "auto",
        background: "#ffffff",
        imageRendering: "pixelated",
      }}
    />
  );
}

export function ProductionLabelsModal({ document: doc, token, warehouseId, onClose, onPrinted }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const orderCode = doc.productionOrderCode || doc.invoiceNumber || "—";
  const dateLabel = doc.completedAt
    ? doc.completedAt.slice(0, 10)
    : formatBogotaDate(new Date().toISOString());

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
    if (printing || labelItems.length === 0) return;
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
        setError(msg === "not_a_production_order" ? "Este documento no es una orden de producción." : msg);
      } finally {
        setPrinting(false);
      }
    };

    window.addEventListener("afterprint", () => void finish(), { once: true });
    window.setTimeout(() => window.print(), 250);
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
              borderBottom: "1.5px solid #0d9488",
              paddingBottom: "3px",
              marginBottom: "4px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <img src={LOGO_SRC} alt="" className="inv-barcode-sheet__logo" width={34} height={34} />
              <div className="inv-barcode-sheet__brand-text">
                <strong style={{ fontSize: "13px", color: "#0f766e" }}>Evolution</strong>
                <span style={{ fontSize: "8px", color: "#64748b", textTransform: "uppercase" }}>
                  Colchones S.A.S
                </span>
              </div>
            </div>
            <div className="inv-barcode-sheet__date" style={{ fontSize: "10px", color: "#475569", fontWeight: "bold" }}>
              Fecha: {dateLabel}
            </div>
          </header>
          <div className="inv-barcode-sheet__body" style={{ marginBottom: "4px" }}>
            <p
              className="inv-barcode-sheet__name"
              style={{ fontSize: "13px", fontWeight: 800, margin: "0 0 2px", color: "#0f172a", lineHeight: 1.15 }}
            >
              {sheet.name}
            </p>
            <div
              className="inv-barcode-sheet__ref"
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "#475569",
                margin: "0 0 2px",
                lineHeight: 1.2,
              }}
            >
              <span>Ref: {sheet.referenceCode || "—"}</span>
            </div>
            <p
              className="inv-barcode-sheet__op"
              style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#0f172a", lineHeight: 1.2 }}
            >
              Orden Prod: {orderCode}
            </p>
          </div>
          <div className="inv-barcode-sheet__code" style={{ textAlign: "center" }}>
            <BarcodeCanvas value={sheet.barcode} />
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
            disabled={printing || labelItems.length === 0}
            title={labelItems.length === 0 ? "Sin productos con código" : "Imprimir etiquetas"}
            onClick={() => void handlePrint()}
          >
            <Printer size={16} strokeWidth={2} aria-hidden />
            {printing ? "Imprimiendo…" : `Imprimir ${totalLabels}`}
          </button>
        </div>
      </div>

      {portalReady && sheets.length > 0 ? createPortal(printSheet, document.body) : null}
    </div>
  );
}
