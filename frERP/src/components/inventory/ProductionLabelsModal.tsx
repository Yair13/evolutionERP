import JsBarcode from "jsbarcode";
import { Compass, Printer, Tag, X } from "lucide-react";
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

function BarcodeSvg({
  value,
  height = 140,
  fontSize = 15,
  widthFactor = 2.7,
  className,
  style,
}: {
  value: string;
  height?: number;
  fontSize?: number;
  widthFactor?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: widthFactor,
        height,
        displayValue: true,
        font: "monospace",
        fontSize,
        fontOptions: "bold",
        textMargin: 4,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (e) {
      console.error("Barcode render error:", e);
    }
  }, [value, height, fontSize, widthFactor]);

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={`Código ${value}`}
      className={className}
      style={{
        display: "block",
        margin: "0 auto",
        width: "90mm",
        height: "30mm",
        maxWidth: "92mm",
        maxHeight: "32mm",
        background: "#ffffff",
        ...style,
      }}
    />
  );
}

export function ProductionLabelsModal({ document: doc, token, warehouseId, onClose, onPrinted }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove("inv-print-barcode-label");
      document.getElementById("inv-print-page-size")?.remove();
    };
  }, []);

  const isPurchase = Boolean(
    doc.entryType === "purchase" ||
    doc.metadata?.entryType === "purchase" ||
    doc.purchaseOrderCode ||
    (doc.invoiceNumber && doc.invoiceNumber.startsWith("COM-"))
  );
  const orderCode = doc.purchaseOrderCode || doc.productionOrderCode || doc.invoiceNumber || "—";
  const docTypeShort = isPurchase ? "COMPRA" : "OP";
  const modalTitle = isPurchase ? "Etiquetas de Compra" : "Etiquetas de OP";
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

    // Inyectar tamaño de página exacto para que el diálogo del navegador no use Carta ni rote incorrectamente
    let pageStyle = document.getElementById("inv-print-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-page-size";
      document.head.appendChild(pageStyle);
    }
    const pageSize = orientation === "vertical" ? "70mm 100mm" : "100mm 70mm";
    pageStyle.textContent = `@page { size: ${pageSize}; margin: 0; }`;

    document.body.classList.remove("inv-print-invoice");
    document.body.classList.add("inv-print-barcode-label");

    const clear = () => {
      document.body.classList.remove("inv-print-barcode-label");
      document.getElementById("inv-print-page-size")?.remove();
    };

    const finish = async () => {
      clear();
      try {
        const { item } = await markLabelsPrinted(token, doc.id, warehouseId);
        onPrinted(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        setError(
          msg === "not_a_production_order"
            ? "Este documento no admite impresión de etiquetas."
            : msg
        );
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

  const firstPreviewItem = labelItems[0];

  const printSheet = (
    <div className="inv-barcode-print-container" id="inv-barcode-label-print">
      {sheets.map((sheet) => (
        <article
          key={sheet.key}
          className={`inv-barcode-sheet ${orientation === "vertical" ? "inv-barcode-sheet--vertical" : ""}`}
          aria-label="Etiqueta adhesiva"
          style={{
            boxSizing: "border-box",
            width: orientation === "vertical" ? "70mm" : "100mm",
            height: orientation === "vertical" ? "98mm" : "68mm",
            minHeight: orientation === "vertical" ? "98mm" : "68mm",
            maxHeight: orientation === "vertical" ? "98mm" : "68mm",
            padding: orientation === "vertical" ? "4mm 4mm" : "3mm 5mm",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
            background: "#ffffff",
            pageBreakAfter: "always",
            breakAfter: "page",
          }}
        >
          <header
            className="inv-barcode-sheet__brand"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              borderBottom: "2px solid #0d9488",
              paddingBottom: "2mm",
              marginBottom: "2.5mm",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src={LOGO_SRC} alt="" className="inv-barcode-sheet__logo" width={38} height={38} style={{ objectFit: "contain" }} />
              <div className="inv-barcode-sheet__brand-text">
                <strong style={{ fontSize: "14px", color: "#0f766e", lineHeight: 1.15 }}>Evolution</strong>
                <span style={{ fontSize: "9px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Colchones S.A.S
                </span>
              </div>
            </div>
            <div className="inv-barcode-sheet__date" style={{ fontSize: "11px", color: "#334155", fontWeight: "bold" }}>
              Fecha: {dateLabel}
            </div>
          </header>
          <div className="inv-barcode-sheet__body" style={{ flexShrink: 0, margin: "2mm 0 2mm" }}>
            <p
              className="inv-barcode-sheet__name"
              style={{
                fontSize: "20px",
                fontWeight: 900,
                margin: "0 0 2mm",
                color: "#0f172a",
                lineHeight: 1.15,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}
            >
              {sheet.name}
            </p>
            <div
              className="inv-barcode-sheet__ref"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "12px",
                color: "#475569",
                lineHeight: 1.25,
                whiteSpace: "nowrap",
              }}
            >
              <span>REF: <strong style={{ color: "#0f172a", fontSize: "13px" }}>{sheet.referenceCode || "—"}</strong></span>
              <span>{docTypeShort}: <strong style={{ color: "#0f172a", fontSize: "13px" }}>{orderCode}</strong></span>
            </div>
          </div>
          <div
            className="inv-barcode-sheet__code"
            style={{
              height: orientation === "vertical" ? "26mm" : "32mm",
              marginTop: "3mm",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              width: "100%",
            }}
          >
            <BarcodeSvg
              value={sheet.barcode}
              height={orientation === "vertical" ? 100 : 140}
              fontSize={15}
              widthFactor={orientation === "vertical" ? 2.3 : 2.7}
              style={{
                width: orientation === "vertical" ? "62mm" : "90mm",
                height: orientation === "vertical" ? "24mm" : "30mm",
                maxWidth: orientation === "vertical" ? "62mm" : "92mm",
                maxHeight: orientation === "vertical" ? "26mm" : "32mm",
              }}
            />
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
        style={{ width: "min(560px, calc(100vw - 32px))", maxHeight: "92vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 id="op-labels-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Tag size={20} strokeWidth={2} aria-hidden />
              {modalTitle}
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

        {/* Selector de orientación */}
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Compass size={16} strokeWidth={2} aria-hidden />
            <span>Orientación de etiqueta:</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
              <input
                type="radio"
                name="label-orientation"
                value="horizontal"
                checked={orientation === "horizontal"}
                onChange={() => setOrientation("horizontal")}
              />
              Horizontal (100 × 70 mm)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
              <input
                type="radio"
                name="label-orientation"
                value="vertical"
                checked={orientation === "vertical"}
                onChange={() => setOrientation("vertical")}
              />
              Vertical (70 × 100 mm)
            </label>
          </div>
        </div>

        {/* Vista previa en pantalla */}
        {firstPreviewItem ? (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
              Vista previa · {orientation === "horizontal" ? "10 × 7 cm (Horizontal)" : "7 × 10 cm (Vertical)"}
            </p>
            <div
              style={{
                width: orientation === "horizontal" ? "340px" : "240px",
                maxWidth: "100%",
                padding: "12px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                background: "#ffffff",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06)",
                margin: "0 auto",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                minHeight: orientation === "horizontal" ? "210px" : "280px",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "2px solid #0d9488",
                  paddingBottom: 4,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <img src={LOGO_SRC} alt="" width={30} height={30} style={{ objectFit: "contain" }} />
                  <div>
                    <strong style={{ fontSize: 13, color: "#0f766e", display: "block", lineHeight: 1.1 }}>Evolution</strong>
                    <span style={{ fontSize: 8.5, color: "#64748b", textTransform: "uppercase" }}>Colchones S.A.S</span>
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "#475569", fontWeight: "bold" }}>Fecha: {dateLabel}</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ display: "block", fontSize: 17, color: "#0f172a", lineHeight: 1.15, textTransform: "uppercase", fontWeight: 900 }}>
                  {firstPreviewItem.name}
                </strong>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#475569", marginTop: 4 }}>
                  <span>REF: <b style={{ color: "#0f172a" }}>{firstPreviewItem.referenceCode || "—"}</b></span>
                  <span>{docTypeShort}: <b style={{ color: "#0f172a" }}>{orderCode}</b></span>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: "auto" }}>
                <BarcodeSvg
                  value={firstPreviewItem.barcode}
                  height={orientation === "vertical" ? 90 : 120}
                  fontSize={14}
                  widthFactor={orientation === "vertical" ? 2.2 : 2.5}
                  style={{
                    width: "100%",
                    height: orientation === "vertical" ? "70px" : "85px",
                    maxHeight: "95px",
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Guía para el diálogo de impresión de Chrome */}
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(13, 148, 136, 0.08)",
            border: "1px solid rgba(13, 148, 136, 0.25)",
            fontSize: 12,
            color: "#0f766e",
            lineHeight: 1.45,
          }}
        >
          <strong>Ajustes al presionar Imprimir (diálogo de Chrome):</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, marginTop: 4 }}>
            <span>• <b>Destino:</b> Tu térmica</span>
            <span>• <b>Diseño:</b> {orientation === "horizontal" ? "Horizontal" : "Vertical"}</span>
            <span>• <b>Márgenes:</b> Ninguno</span>
            <span>• <b>Escala:</b> 100%</span>
          </div>
        </div>

        {labelItems.length === 0 ? (
          <p style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
            {isPurchase
              ? "Esta compra no tiene productos con código de barras. No hay etiquetas para imprimir."
              : "Esta orden no tiene productos con código de barras. No hay etiquetas para imprimir."}
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
                  padding: "8px 12px",
                  borderRadius: 8,
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
