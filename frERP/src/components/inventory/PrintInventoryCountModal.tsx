import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Printer, Receipt, X } from "lucide-react";
import type { InventoryCountDetail, InventoryCountLine } from "../../features/inventory/inventory.types.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

type Props = {
  count: InventoryCountDetail;
  initialFormat?: "half_letter" | "voucher";
  onClose: () => void;
};

export function PrintInventoryCountModal({ count, initialFormat = "half_letter", onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [format, setFormat] = useState<"half_letter" | "voucher">(initialFormat);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    function clearPrintClass() {
      document.body.classList.remove("inv-print-count-half-letter", "inv-print-count-voucher");
      document.getElementById("inv-print-count-page-size")?.remove();
    }
    window.addEventListener("afterprint", clearPrintClass);
    return () => {
      window.removeEventListener("afterprint", clearPrintClass);
      clearPrintClass();
    };
  }, []);

  function handlePrint() {
    let pageStyle = document.getElementById("inv-print-count-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-count-page-size";
      document.head.appendChild(pageStyle);
    }

    if (format === "voucher") {
      document.body.classList.remove("inv-print-count-half-letter");
      document.body.classList.add("inv-print-count-voucher");
      pageStyle.textContent = "@page { size: auto; margin: 0mm; }";
    } else {
      document.body.classList.remove("inv-print-count-voucher");
      document.body.classList.add("inv-print-count-half-letter");
      pageStyle.textContent = "@page { size: letter portrait; margin: 0.25in; }";
    }

    window.setTimeout(() => window.print(), 80);
  }

  const isInitial = count.countKind === "initial";
  const docTitle = isInitial ? "ACTA DE INVENTARIO INICIAL" : "ACTA DE CIERRE Y DESCUADRE DE INVENTARIO";
  const netDiff = count.countedTotal - count.expectedTotal;

  // ─── RENDER FORMATO BAUCHER / TIRILLA (POS 80mm) ───────────────────────────
  const renderVoucherContent = () => (
    <div
      className="count-voucher-body"
      style={{
        width: "72mm",
        maxWidth: "72mm",
        margin: "0 auto",
        padding: "3mm 2.5mm",
        background: "#ffffff",
        color: "#000000",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "10px",
        lineHeight: 1.25,
        boxSizing: "border-box",
      }}
    >
      {/* Cabecera */}
      <div style={{ textAlign: "center", borderBottom: "1.5px dashed #000000", paddingBottom: "4px", marginBottom: "5px" }}>
        <div style={{ fontSize: "13px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          EVOLUTION ERP
        </div>
        <div style={{ fontSize: "9px", fontWeight: 700, marginTop: "2px" }}>
          Sede: {count.warehouseName ?? "Sede Operativa"} {count.warehouseCode ? `(${count.warehouseCode})` : ""}
        </div>
        <div style={{ fontSize: "10.5px", fontWeight: 800, marginTop: "3px", textTransform: "uppercase" }}>
          {docTitle}
        </div>
        <div style={{ fontSize: "11px", fontWeight: 800, marginTop: "2px" }}>
          Nº {count.invoiceNumber ?? count.id.slice(0, 8)}
        </div>
        <div style={{ fontSize: "9px", color: "#333333", marginTop: "2px" }}>
          {formatBogotaDateTime(count.completedAt ?? count.createdAt)}
        </div>
        {count.createdByName && (
          <div style={{ fontSize: "9px", color: "#333333", marginTop: "1px" }}>
            Auditor / Responsable: {count.createdByName}
          </div>
        )}
      </div>

      {/* Resumen numérico */}
      <div style={{ borderBottom: "1px dashed #000000", paddingBottom: "5px", marginBottom: "5px", fontSize: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span>Total en Sistema:</span>
          <strong>{count.expectedTotal} uds</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span>Total Contado Físico:</span>
          <strong>{count.countedTotal} uds</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "11px", marginTop: "3px" }}>
          <span>Diferencia Neta:</span>
          <span style={{ color: netDiff === 0 ? "#000" : netDiff > 0 ? "#166534" : "#991b1b" }}>
            {netDiff > 0 ? `+${netDiff}` : netDiff} uds {netDiff === 0 ? "(CUADRADO)" : netDiff > 0 ? "(SOBRANTE)" : "(FALTANTE)"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5px", color: "#444", marginTop: "3px" }}>
          <span>Cuadran: {count.matchedCount}</span>
          <span>Faltan: {count.shortCount}</span>
          <span>Sobran: {count.overCount}</span>
        </div>
      </div>

      {/* Lista de referencias */}
      <div style={{ marginBottom: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #000000", paddingBottom: "2px", fontWeight: 700, fontSize: "9px" }}>
          <span>REF / PRODUCTO</span>
          <span>SIS | FÍS | DIF</span>
        </div>
        {count.lines.map((line: InventoryCountLine) => {
          const diff = line.difference;
          return (
            <div
              key={line.id}
              style={{
                borderBottom: "0.5px dotted #cccccc",
                padding: "3px 0",
                fontSize: "9px",
              }}
            >
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {line.referenceCode} - {line.productName}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5px", color: "#222", marginTop: "1px" }}>
                <span>{line.barcode ? `CB: ${line.barcode}` : ""}</span>
                <span>
                  Sis: <strong>{line.expectedQuantity}</strong> | Fís: <strong>{line.countedQuantity}</strong> | Dif:{" "}
                  <strong style={{ color: diff === 0 ? "#000" : diff > 0 ? "#166534" : "#991b1b" }}>
                    {diff > 0 ? `+${diff}` : diff}
                  </strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notas */}
      {count.notes && (
        <div style={{ borderTop: "1px dashed #000000", paddingTop: "4px", marginBottom: "6px", fontSize: "8.5px" }}>
          <strong>Observaciones:</strong> {count.notes}
        </div>
      )}

      {/* Firmas en tirilla */}
      <div style={{ borderTop: "1px dashed #000000", paddingTop: "14px", marginTop: "10px", textAlign: "center" }}>
        <div style={{ borderTop: "1px solid #000000", width: "80%", margin: "0 auto", paddingTop: "3px", fontSize: "8.5px", fontWeight: 700 }}>
          FIRMA AUDITOR / RESPONSABLE
        </div>
        <div style={{ fontSize: "7.5px", color: "#555", marginTop: "2px" }}>
          Evolution ERP · Control de Inventario
        </div>
      </div>
    </div>
  );

  // ─── RENDER FORMATO MEDIA CARTA ───────────────────────────────────────────
  const renderHalfLetterContent = () => (
    <article
      className="count-half-letter-body"
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "16px 20px",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "12px",
        lineHeight: 1.35,
        boxSizing: "border-box",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
      }}
    >
      {/* Cabecera */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "2px solid #0f766e",
          paddingBottom: "10px",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={LOGO_SRC} alt="Evolution ERP" style={{ height: "42px", objectFit: "contain" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f766e", textTransform: "uppercase" }}>
              Evolution ERP
            </h1>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
              {docTitle}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "14px", fontWeight: 900, color: "#0f172a" }}>
            ACTA Nº {count.invoiceNumber ?? count.id.slice(0, 8)}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Fecha de Cierre: <strong>{formatBogotaDateTime(count.completedAt ?? count.createdAt)}</strong>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Sede: <strong>{count.warehouseName ?? "Sede actual"} {count.warehouseCode ? `(${count.warehouseCode})` : ""}</strong>
          </div>
        </div>
      </header>

      {/* Metadatos y Resumen */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "8px",
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "6px",
          padding: "10px 14px",
          marginBottom: "12px",
        }}
      >
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Auditor / Conteo:</span>
          <strong style={{ fontSize: "11px", color: "#0f172a" }}>{count.createdByName || "Administrador"}</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Stock Sistema:</span>
          <strong style={{ fontSize: "13px", color: "#0f172a" }}>{count.expectedTotal} uds</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Conteo Físico:</span>
          <strong style={{ fontSize: "13px", color: "#0f766e" }}>{count.countedTotal} uds</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Diferencia Neta:</span>
          <strong
            style={{
              fontSize: "13px",
              color: netDiff === 0 ? "#166534" : netDiff > 0 ? "#0284c7" : "#b91c1c",
            }}
          >
            {netDiff > 0 ? `+${netDiff}` : netDiff} uds {netDiff === 0 ? "✓ Cuadra" : netDiff > 0 ? "(Sobrante)" : "(Faltante)"}
          </strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Balance de Ítems:</span>
          <span style={{ fontSize: "11px", fontWeight: 600 }}>
            <span style={{ color: "#166534" }}>{count.matchedCount} ok</span> ·{" "}
            <span style={{ color: "#b91c1c" }}>{count.shortCount} faltan</span> ·{" "}
            <span style={{ color: "#0284c7" }}>{count.overCount} sobran</span>
          </span>
        </div>
      </section>

      {/* Tabla detallada de referencias */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "11px",
          marginBottom: "14px",
        }}
      >
        <thead>
          <tr style={{ background: "#0f766e", color: "#ffffff", textAlign: "left" }}>
            <th style={{ padding: "6px 8px", width: "110px" }}>Referencia</th>
            <th style={{ padding: "6px 8px" }}>Descripción del Producto</th>
            <th style={{ padding: "6px 8px", textAlign: "right", width: "70px" }}>Sistema</th>
            <th style={{ padding: "6px 8px", textAlign: "right", width: "70px" }}>Físico</th>
            <th style={{ padding: "6px 8px", textAlign: "right", width: "80px" }}>Diferencia</th>
            <th style={{ padding: "6px 8px", textAlign: "center", width: "85px" }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {count.lines.map((line: InventoryCountLine, idx: number) => {
            const diff = line.difference;
            const isMatch = diff === 0;
            const isShort = diff < 0;
            return (
              <tr
                key={line.id}
                style={{
                  background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <td style={{ padding: "5px 8px", fontWeight: 700 }}>{line.referenceCode}</td>
                <td style={{ padding: "5px 8px" }}>
                  {line.productName}
                  {line.barcode ? <span style={{ color: "#64748b", fontSize: "10px" }}> · {line.barcode}</span> : null}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{line.expectedQuantity}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#0f766e" }}>
                  {line.countedQuantity}
                </td>
                <td
                  style={{
                    padding: "5px 8px",
                    textAlign: "right",
                    fontWeight: 800,
                    color: isMatch ? "#475569" : isShort ? "#b91c1c" : "#0284c7",
                  }}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                  {isMatch ? (
                    <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: 4, background: "#dcfce7", color: "#166534", fontWeight: 700 }}>
                      Cuadra
                    </span>
                  ) : isShort ? (
                    <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>
                      Faltante
                    </span>
                  ) : (
                    <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: 4, background: "#e0f2fe", color: "#0369a1", fontWeight: 700 }}>
                      Sobrante
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Notas / Observaciones */}
      {count.notes && (
        <div style={{ marginBottom: "14px", padding: "8px 12px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: "10.5px" }}>
          <strong>Observaciones del Cierre:</strong> {count.notes}
        </div>
      )}

      {/* Bloque de firmas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "30px",
          marginTop: "24px",
          paddingTop: "10px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #475569", width: "85%", margin: "0 auto 4px auto" }} />
          <div style={{ fontWeight: 700, fontSize: "11px" }}>Firma Auditor / Quien Realiza el Conteo</div>
          <div style={{ fontSize: "9.5px", color: "#64748b" }}>C.C. _______________________</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #475569", width: "85%", margin: "0 auto 4px auto" }} />
          <div style={{ fontWeight: 700, fontSize: "11px" }}>Firma Administrador / Responsable de Sede</div>
          <div style={{ fontSize: "9.5px", color: "#64748b" }}>C.C. _______________________</div>
        </div>
      </div>

      <footer style={{ marginTop: "16px", paddingTop: "8px", borderTop: "1px dashed #cbd5e1", textAlign: "center", fontSize: "9.5px", color: "#94a3b8" }}>
        Evolution ERP · Documento Oficial de Acta de Inventario · Media Hoja Carta
      </footer>
    </article>
  );

  const modal = (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="inv-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: format === "voucher" ? "420px" : "860px",
          width: "95vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#f8fafc",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Barra superior de control */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 18px",
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          {/* Selector de formato: Media Carta vs Baucher */}
          <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <button
              type="button"
              onClick={() => setFormat("half_letter")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                fontSize: "0.85rem",
                fontWeight: 700,
                borderRadius: "6px",
                border: "none",
                background: format === "half_letter" ? "#ffffff" : "transparent",
                color: format === "half_letter" ? "#0f766e" : "#475569",
                boxShadow: format === "half_letter" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
              }}
            >
              <FileText size={15} />
              <span>Media Carta</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat("voucher")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                fontSize: "0.85rem",
                fontWeight: 700,
                borderRadius: "6px",
                border: "none",
                background: format === "voucher" ? "#ffffff" : "transparent",
                color: format === "voucher" ? "#0f766e" : "#475569",
                boxShadow: format === "voucher" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
              }}
            >
              <Receipt size={15} />
              <span>Baucher / Tirilla POS</span>
            </button>
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                background: "#0f766e",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              <Printer size={16} />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                padding: "6px",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#64748b",
              }}
              title="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Vista previa en pantalla */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: "#f1f5f9",
          }}
        >
          {format === "voucher" ? renderVoucherContent() : renderHalfLetterContent()}
        </div>
      </div>
    </div>
  );

  return portalReady ? (
    <>
      {createPortal(modal, document.body)}
      {/* Contenedores invisibles en pantalla para el comando window.print() */}
      {createPortal(
        <div id="inv-count-voucher-print-area" aria-hidden="true" style={{ display: "none" }}>
          {renderVoucherContent()}
        </div>,
        document.body
      )}
      {createPortal(
        <div id="inv-count-half-letter-print-area" aria-hidden="true" style={{ display: "none" }}>
          {renderHalfLetterContent()}
        </div>,
        document.body
      )}
    </>
  ) : null;
}
