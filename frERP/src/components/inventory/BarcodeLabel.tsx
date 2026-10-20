import JsBarcode from "jsbarcode";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { formatBogotaDate } from "../../lib/dateUtils.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

type Props = {
  value: string;
  title: string;
  subtitle?: string;
  salePrice?: number;
  productionOrder?: string;
  date?: string;
  quantity?: number; // Cantidad de copias a imprimir
};

const BARCODE_SCREEN = {
  format: "CODE128" as const,
  width: 2.2,
  height: 60,
  displayValue: false,
  margin: 4,
};

const BARCODE_PRINT = {
  format: "CODE128" as const,
  width: 2,
  height: 48,
  displayValue: false,
  margin: 2,
};

export function printBarcodeLabelSheet() {
  let pageStyle = document.getElementById("inv-print-page-size");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "inv-print-page-size";
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = "@page { size: 100mm 70mm; margin: 0; }";

  document.body.classList.remove("inv-print-invoice");
  document.body.classList.add("inv-print-barcode-label");
  window.addEventListener(
    "afterprint",
    () => {
      document.body.classList.remove("inv-print-barcode-label");
      document.getElementById("inv-print-page-size")?.remove();
    },
    { once: true }
  );
  window.print();
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function renderBarcode(svg: SVGSVGElement | null, value: string, opts: typeof BARCODE_SCREEN) {
  if (!svg || !value) return;
  try {
    JsBarcode(svg, value, opts);
  } catch {
    /* código no compatible */
  }
}

export function BarcodeLabel({ value, title, subtitle, salePrice, productionOrder, date, quantity }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const displayDate = date || formatBogotaDate(new Date().toISOString());
  const displayOP = productionOrder || "—";
  const priceLabel = salePrice != null && salePrice > 0 ? formatMoney(salePrice) : null;
  const copies = quantity && Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;

  function onPrint() {
    printBarcodeLabelSheet();
  }

  // Callback ref para renderizar el código de barras en pantalla (preview)
  const screenRefCallback = (svg: SVGSVGElement | null) => {
    if (svg) {
      renderBarcode(svg, value, BARCODE_SCREEN);
    }
  };

  // Callback ref para renderizar cada una de las copias impresas
  const printRefCallback = (svg: SVGSVGElement | null) => {
    if (svg) {
      renderBarcode(svg, value, BARCODE_PRINT);
    }
  };

  const printSheet = (
    <div className="inv-barcode-print-container" id="inv-barcode-label-print">
      {Array.from({ length: copies }).map((_, idx) => (
        <article key={idx} className="inv-barcode-sheet" aria-label="Etiqueta adhesiva">
          <header className="inv-barcode-sheet__brand" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottom: "1.5px solid #0d9488", paddingBottom: "3px", marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <img src={LOGO_SRC} alt="" className="inv-barcode-sheet__logo" width={34} height={34} />
              <div className="inv-barcode-sheet__brand-text">
                <strong style={{ fontSize: "13px", color: "#0f766e" }}>Evolution</strong>
                <span style={{ fontSize: "8px", color: "#64748b", textTransform: "uppercase" }}>Colchones S.A.S</span>
              </div>
            </div>
            <div className="inv-barcode-sheet__date" style={{ fontSize: "10px", color: "#475569", fontWeight: "bold" }}>
              Fecha: {displayDate}
            </div>
          </header>
          <div className="inv-barcode-sheet__body" style={{ marginBottom: "4px" }}>
            <p className="inv-barcode-sheet__name" style={{ fontSize: "13px", fontWeight: "800", margin: "0 0 2px", color: "#0f172a", lineHeight: 1.15 }}>{title}</p>
            <div className="inv-barcode-sheet__ref" style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#475569", margin: "0 0 2px", lineHeight: 1.2 }}>
              <span>Ref: {subtitle || "—"}</span>
              {priceLabel ? <span>Precio: {priceLabel}</span> : null}
            </div>
            <p className="inv-barcode-sheet__op" style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#0f172a", lineHeight: 1.2 }}>
              Orden Prod: {displayOP}
            </p>
          </div>
          <div className="inv-barcode-sheet__code" style={{ textAlign: "center" }}>
            <svg ref={printRefCallback} role="img" aria-hidden style={{ display: "block", margin: "0 auto", maxWidth: "90%", maxHeight: "20mm" }} />
            <p className="inv-barcode-sheet__digits" style={{ fontSize: "10px", fontWeight: "bold", letterSpacing: "0.12em", marginTop: "2px", color: "#334155" }}>{value}</p>
          </div>
        </article>
      ))}
    </div>
  );

  return (
    <div className="inv-barcode-label">
      <div className="inv-barcode-label__preview no-print">
        <p className="inv-barcode-label__hint">Vista previa · etiqueta adhesiva (10 x 7 cm)</p>
        <div className="inv-barcode-label__mock" style={{ width: "380px", padding: "18px", border: "1px solid #cbd5e1", borderRadius: "12px", background: "#fff", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <header className="inv-barcode-sheet__brand" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottom: "2px solid #0d9488", paddingBottom: "4px", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src={LOGO_SRC} alt="" className="inv-barcode-sheet__logo" width={32} height={32} />
              <div className="inv-barcode-sheet__brand-text">
                <strong style={{ fontSize: "12px", color: "#0f766e" }}>Evolution</strong>
                <span style={{ fontSize: "8px", color: "#64748b", textTransform: "uppercase" }}>Colchones S.A.S</span>
              </div>
            </div>
            <div style={{ fontSize: "10px", color: "#475569" }}>
              Fecha: {displayDate}
            </div>
          </header>
          <div className="inv-barcode-sheet__body" style={{ marginBottom: "8px" }}>
            <p className="inv-barcode-sheet__name" style={{ fontSize: "13px", fontWeight: "800", margin: "0 0 4px" }}>{title}</p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#475569" }}>
              <span>Ref: {subtitle || "—"}</span>
              {priceLabel ? <span>Precio: {priceLabel}</span> : null}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "11px", fontWeight: "bold" }}>
              Orden Prod: {displayOP}
            </p>
          </div>
          <div className="inv-barcode-sheet__code" style={{ textAlign: "center" }}>
            <svg ref={screenRefCallback} role="img" aria-label={`Código ${value}`} style={{ display: "block", margin: "0 auto", maxWidth: "80%" }} />
            <p className="inv-barcode-sheet__digits" style={{ fontSize: "10px", fontWeight: "bold", letterSpacing: "0.12em", marginTop: "2px" }}>{value}</p>
          </div>
        </div>
        <button type="button" className="inv-btn inv-btn--primary" onClick={onPrint} style={{ marginTop: "12px" }}>
          <Printer size={16} strokeWidth={2} aria-hidden />
          Imprimir {copies > 1 ? `${copies} etiquetas` : "etiqueta"}
        </button>
      </div>
      {portalReady ? createPortal(printSheet, document.body) : null}
    </div>
  );
}
