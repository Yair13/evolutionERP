import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, FileText, Receipt } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

export interface LayawayPaymentVoucherItem {
  name?: string;
  productName?: string;
  referenceCode?: string;
  quantity: number;
  unitPrice: number;
}

export interface LayawayPaymentVoucherData {
  // Comprobante de abono
  receiptNumber: string;
  createdAt: string;
  amount: number;
  paymentMethod: string;
  notes?: string | null;
  createdByName?: string | null;

  // Datos del apartado / plan separe
  layawayCode: string;
  warehouseName: string;
  warehouseCode: string;
  customerName: string;
  customerTaxId?: string | null;
  customerPhone?: string | null;
  targetAmount: number;
  paidAmount: number;
  remainingAmount: number;
  expiryDate?: string | null;
  layawayNotes?: string | null;
  items?: LayawayPaymentVoucherItem[];
}

type Props = {
  open: boolean;
  data: LayawayPaymentVoucherData | null;
  initialFormat?: "voucher" | "half_letter";
  onClose: () => void;
};

function formatMoney(n: number): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatDate(iso: string | null): string {
  return formatBogotaDateTime(iso, { dateStyle: "short", timeStyle: "short" });
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    efectivo: "Efectivo 💵",
    bancolombia: "Bancolombia 🟡",
    davivienda: "Davivienda 🔴",
    nequi: "Nequi 🟣",
    daviplata: "Daviplata 🔴",
    bold: "Bold 🔵",
    addi: "Addi 🟢",
    sistecredito: "Sistecrédito",
    saldo_a_favor: "Saldo a Favor 💰",
  };
  return map[method?.toLowerCase()] ?? (method || "Efectivo");
}

export function PrintLayawayPaymentVoucherModal({
  open,
  data,
  initialFormat = "voucher",
  onClose,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [format, setFormat] = useState<"voucher" | "half_letter">(initialFormat);

  useEffect(() => {
    setFormat(initialFormat);
  }, [initialFormat, open]);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      document.body.classList.remove(
        "inv-printing-layaway-ticket",
        "inv-printing-layaway-half-letter"
      );
      document.getElementById("inv-print-layaway-page-size")?.remove();
    };
  }, []);

  if (!open || !data) return null;

  function handlePrint() {
    let pageStyle = document.getElementById("inv-print-layaway-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-layaway-page-size";
      document.head.appendChild(pageStyle);
    }

    if (format === "voucher") {
      document.body.classList.remove("inv-printing-layaway-half-letter");
      document.body.classList.add("inv-printing-layaway-ticket");
      pageStyle.textContent = "@page { size: auto; margin: 0mm; }";
    } else {
      document.body.classList.remove("inv-printing-layaway-ticket");
      document.body.classList.add("inv-printing-layaway-half-letter");
      pageStyle.textContent = "@page { size: letter portrait; margin: 0.25in; }";
    }

    const cleanup = () => {
      document.body.classList.remove(
        "inv-printing-layaway-ticket",
        "inv-printing-layaway-half-letter"
      );
      document.getElementById("inv-print-layaway-page-size")?.remove();
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 100);
  }

  // 1. Tarjeta visual del ticket Baucher (70 mm para rollo térmico de 80 mm)
  const renderVoucherContent = () => (
    <div
      className="layaway-ticket-body"
      style={{
        width: "70mm",
        maxWidth: "70mm",
        margin: "0 auto",
        padding: "2mm 2.5mm 3mm 2.5mm",
        background: "#ffffff",
        color: "#000000",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "10px",
        lineHeight: 1.25,
        boxSizing: "border-box",
      }}
    >
      {/* Encabezado */}
      <div
        style={{
          textAlign: "center",
          borderBottom: "1.5px dashed #000000",
          paddingBottom: "4px",
          marginBottom: "4px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "#000000",
          }}
        >
          Evolution ERP
        </div>
        <div style={{ fontSize: "9px", fontWeight: 700, color: "#000000", marginTop: "1px" }}>
          SEDE: {data.warehouseName.toUpperCase()} ({data.warehouseCode})
        </div>
        <div
          style={{
            fontSize: "10.5px",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginTop: "3px",
            color: "#000000",
          }}
        >
          RECIBO DE ABONO · PLAN SEPARE
        </div>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.05em",
            marginTop: "2px",
            color: "#000000",
          }}
        >
          {data.receiptNumber}
        </div>
        <div style={{ fontSize: "8.5px", color: "#000000", marginTop: "1px" }}>
          FECHA: {formatDate(data.createdAt)}
        </div>
      </div>

      {/* Datos del Apartado y Cliente */}
      <div
        style={{
          borderBottom: "1px dashed #000000",
          paddingBottom: "4px",
          marginBottom: "4px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 800 }}>APARTADO:</span>
          <span style={{ fontWeight: 900, fontSize: "10px" }}>{data.layawayCode}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
          <span style={{ fontWeight: 700 }}>CLIENTE:</span>
          <span style={{ fontWeight: 800, textAlign: "right" }}>{data.customerName}</span>
        </div>
        {data.customerTaxId && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>DOC / CÉDULA:</span>
            <span>{data.customerTaxId}</span>
          </div>
        )}
        {data.customerPhone && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
            <span style={{ fontWeight: 700 }}>TELÉFONO:</span>
            <span>{data.customerPhone}</span>
          </div>
        )}
        {data.expiryDate && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1px" }}>
            <span style={{ fontWeight: 700 }}>FECHA LÍMITE / VENCE:</span>
            <span style={{ fontWeight: 800 }}>{data.expiryDate}</span>
          </div>
        )}
      </div>

      {/* Artículos apartados (si existen) */}
      {data.items && data.items.length > 0 && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "4px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: "2px", textTransform: "uppercase" }}>
            Artículos en Separación:
          </div>
          {data.items.map((it, idx) => {
            const name = it.name || it.productName || "Artículo";
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "1px",
                  lineHeight: 1.2,
                }}
              >
                <span>
                  {it.quantity}x {name} {it.referenceCode ? `(${it.referenceCode})` : ""}
                </span>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatMoney(it.quantity * it.unitPrice)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Observaciones generales del apartado */}
      {data.layawayNotes && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "3px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <span style={{ fontWeight: 700 }}>DETALLE / ARTÍCULOS: </span>
          <span>{data.layawayNotes}</span>
        </div>
      )}

      {/* Bloque Financiero del Abono */}
      <div
        style={{
          borderBottom: "1.5px dashed #000000",
          paddingBottom: "4px",
          marginBottom: "5px",
          fontSize: "9px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span>VALOR TOTAL PLAN:</span>
          <span style={{ fontWeight: 800 }}>{formatMoney(data.targetAmount)}</span>
        </div>

        {/* Destacado del abono actual */}
        <div
          style={{
            background: "#f1f5f9",
            border: "1px solid #000000",
            borderRadius: "3px",
            padding: "4px",
            margin: "3px 0",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "8.5px", fontWeight: 800, textTransform: "uppercase" }}>
            VALOR ABONADO EN ESTE RECIBO
          </div>
          <div style={{ fontSize: "14px", fontWeight: 900, margin: "1px 0" }}>
            {formatMoney(data.amount)}
          </div>
          <div style={{ fontSize: "8.5px", fontWeight: 700 }}>
            MEDIO: {methodLabel(data.paymentMethod).toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
          <span>TOTAL ACUMULADO ABONADO:</span>
          <span style={{ fontWeight: 800 }}>{formatMoney(data.paidAmount)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "2px",
            fontSize: "10px",
          }}
        >
          <span style={{ fontWeight: 900 }}>SALDO PENDIENTE:</span>
          <span style={{ fontWeight: 900 }}>{formatMoney(data.remainingAmount)}</span>
        </div>
      </div>

      {/* Notas del abono */}
      {data.notes && (
        <div
          style={{
            borderBottom: "1px dashed #000000",
            paddingBottom: "3px",
            marginBottom: "4px",
            fontSize: "8.5px",
          }}
        >
          <span style={{ fontWeight: 700 }}>OBSERVACIÓN DEL ABONO: </span>
          <span>{data.notes}</span>
        </div>
      )}

      {/* Atendido por */}
      <div style={{ fontSize: "8.5px", marginBottom: "8px" }}>
        <span>REGISTRADO POR: </span>
        <span style={{ fontWeight: 800 }}>
          {data.createdByName ? data.createdByName.toUpperCase() : "CAJERO EN TURNO"}
        </span>
      </div>

      {/* Espacio para Firma del Cliente */}
      <div style={{ marginTop: "14px", textAlign: "center" }}>
        <div
          style={{
            borderTop: "1px solid #000000",
            width: "80%",
            margin: "0 auto 2px auto",
          }}
        />
        <div style={{ fontSize: "8px", fontWeight: 800, textTransform: "uppercase" }}>
          FIRMA DEL CLIENTE / RECIBÍ CONFORME
        </div>
        <div style={{ fontSize: "7.5px", color: "#333333" }}>
          C.C. {data.customerTaxId || "____________________"}
        </div>
      </div>

      {/* Pie de Página / Agradecimiento */}
      <div
        style={{
          marginTop: "10px",
          textAlign: "center",
          fontSize: "7.5px",
          color: "#000000",
          lineHeight: 1.25,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          Conserve este comprobante para reclamar su mercancía apartada.
        </div>
        <div>Los planes de apartado se rigen según las condiciones de la tienda.</div>
        <div style={{ fontWeight: 800, marginTop: "2px" }}>¡GRACIAS POR SU COMPRA!</div>
      </div>
    </div>
  );

  // 2. Tarjeta visual Media Carta (Half-Letter horizontal/vertical para impresora estándar)
  const renderHalfLetterContent = () => (
    <article
      className="layaway-half-letter-body"
      style={{
        width: "100%",
        maxWidth: "185mm",
        margin: "0 auto",
        padding: "8mm 10mm",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "12px",
        lineHeight: 1.35,
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        boxSizing: "border-box",
      }}
    >
      {/* Banner Superior Corporativo */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid #4f46e5",
          paddingBottom: "10px",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={LOGO_SRC} alt="Evolution" width={42} height={42} style={{ borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#1e1b4b", letterSpacing: "0.03em" }}>
              EVOLUTION · COLCHONES S.A.S
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              Sede: {data.warehouseName} ({data.warehouseCode})
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: "#4f46e5",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            RECIBO DE ABONO · PLAN SEPARE
          </div>
          <div style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
            {data.receiptNumber}
          </div>
          <div style={{ fontSize: "11px", color: "#475569" }}>
            Fecha: <strong>{formatDate(data.createdAt)}</strong>
          </div>
        </div>
      </div>

      {/* Grid: Datos del Apartado y Datos del Cliente */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          padding: "10px 14px",
          marginBottom: "14px",
          fontSize: "11.5px",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, color: "#4f46e5", marginBottom: "4px", textTransform: "uppercase", fontSize: "10px" }}>
            Información del Cliente
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Nombre: </span>
            <strong style={{ color: "#0f172a" }}>{data.customerName}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>C.C. / NIT: </span>
            <span>{data.customerTaxId || "—"}</span>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Teléfono: </span>
            <span>{data.customerPhone || "—"}</span>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 800, color: "#4f46e5", marginBottom: "4px", textTransform: "uppercase", fontSize: "10px" }}>
            Información del Apartado
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Código Apartado: </span>
            <strong style={{ color: "#4f46e5" }}>{data.layawayCode}</strong>
          </div>
          {data.expiryDate && (
            <div>
              <span style={{ color: "#64748b" }}>Fecha Límite / Vence: </span>
              <strong>{data.expiryDate}</strong>
            </div>
          )}
          <div>
            <span style={{ color: "#64748b" }}>Registrado por: </span>
            <span>{data.createdByName || "Cajero en turno"}</span>
          </div>
        </div>
      </div>

      {/* Artículos apartados (si existen) */}
      {data.items && data.items.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "6px", textTransform: "uppercase" }}>
            Artículos en Separación
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "11.5px",
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "1.5px solid #cbd5e1" }}>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Descripción</th>
                <th style={{ textAlign: "center", padding: "5px 8px", width: "60px" }}>Cant.</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: "100px" }}>P. Unitario</th>
                <th style={{ textAlign: "right", padding: "5px 8px", width: "110px" }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, idx) => {
                const name = it.name || it.productName || "Artículo";
                const total = it.quantity * it.unitPrice;
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "5px 8px" }}>
                      <strong>{name}</strong>
                      {it.referenceCode && <span style={{ color: "#64748b", marginLeft: "6px" }}>Ref: {it.referenceCode}</span>}
                    </td>
                    <td style={{ textAlign: "center", padding: "5px 8px" }}>{it.quantity}</td>
                    <td style={{ textAlign: "right", padding: "5px 8px" }}>{formatMoney(it.unitPrice)}</td>
                    <td style={{ textAlign: "right", padding: "5px 8px", fontWeight: 700 }}>{formatMoney(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Observaciones generales de los artículos si no hay tabla */}
      {data.layawayNotes && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: "4px",
            padding: "8px 12px",
            marginBottom: "14px",
            fontSize: "11.5px",
          }}
        >
          <strong style={{ color: "#475569" }}>Detalle / Artículos: </strong>
          <span>{data.layawayNotes}</span>
        </div>
      )}

      {/* Resumen Financiero: Bloque de Totales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px",
          borderTop: "2px solid #e2e8f0",
          paddingTop: "10px",
          marginBottom: "14px",
        }}
      >
        <div>
          {data.notes && (
            <div style={{ fontSize: "11px", color: "#475569", background: "#f8fafc", padding: "8px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
              <strong>Nota del abono: </strong> {data.notes}
            </div>
          )}
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#64748b" }}>
            Medio de pago utilizado: <strong style={{ color: "#0f172a" }}>{methodLabel(data.paymentMethod)}</strong>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#475569" }}>Valor Meta del Apartado:</span>
            <strong>{formatMoney(data.targetAmount)}</strong>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#ecfdf5",
              border: "1px solid #10b981",
              borderRadius: "4px",
              padding: "6px 10px",
              margin: "3px 0",
            }}
          >
            <span style={{ fontWeight: 800, color: "#065f46" }}>VALOR ABONADO EN ESTE RECIBO:</span>
            <strong style={{ fontSize: "15px", color: "#047857" }}>{formatMoney(data.amount)}</strong>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#475569" }}>Total Acumulado Abonado:</span>
            <strong style={{ color: "#059669" }}>{formatMoney(data.paidAmount)}</strong>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1.5px solid #cbd5e1",
              paddingTop: "4px",
              marginTop: "2px",
              fontSize: "13px",
            }}
          >
            <strong style={{ color: "#0f172a" }}>SALDO PENDIENTE:</strong>
            <strong style={{ color: data.remainingAmount === 0 ? "#059669" : "#d97706", fontSize: "14px" }}>
              {formatMoney(data.remainingAmount)}
            </strong>
          </div>
        </div>
      </div>

      {/* Firmas de Entrega y Recibo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginTop: "22px",
          paddingTop: "6px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #475569", width: "85%", margin: "0 auto 4px auto" }} />
          <div style={{ fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase" }}>
            Cajero / Responsable
          </div>
          <div style={{ fontSize: "9.5px", color: "#64748b" }}>{data.createdByName || "Evolution ERP"}</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #475569", width: "85%", margin: "0 auto 4px auto" }} />
          <div style={{ fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase" }}>
            Firma del Cliente / Recibí Conforme
          </div>
          <div style={{ fontSize: "9.5px", color: "#64748b" }}>
            C.C. {data.customerTaxId || "______________________"}
          </div>
        </div>
      </div>

      {/* Nota Legal al pie */}
      <div
        style={{
          marginTop: "16px",
          borderTop: "1px dashed #cbd5e1",
          paddingTop: "6px",
          textAlign: "center",
          fontSize: "9px",
          color: "#64748b",
        }}
      >
        Conserve este comprobante original para tramitar el retiro de su mercancía apartada · Evolution Colchones S.A.S
      </div>
    </article>
  );

  return (
    <div
      className="inv-modal-backdrop"
      style={{
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="inv-modal no-print"
        role="dialog"
        aria-labelledby="layaway-print-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: format === "half_letter" ? "780px" : "440px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "8px",
          background: "#ffffff",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          transition: "max-width 0.2s ease-in-out",
        }}
      >
        {/* Cabecera del Modal con Selector de Formato (Toggle) */}
        <div
          className="inv-modal__header no-print"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Printer size={18} color="#4f46e5" />
            <h2
              id="layaway-print-modal-title"
              style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#0f172a" }}
            >
              Comprobante de Abono · Plan Separe
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Toggle de formato: Media Carta vs Baucher */}
            <div className="inv-print-format-toggle" role="group" aria-label="Formato de impresión">
              <button
                type="button"
                className={`inv-format-btn ${format === "half_letter" ? "is-active" : ""}`}
                onClick={() => setFormat("half_letter")}
                title="Formato media carta horizontal/vertical para impresora normal"
              >
                <FileText size={15} />
                <span>Media Carta</span>
              </button>
              <button
                type="button"
                className={`inv-format-btn ${format === "voucher" ? "is-active" : ""}`}
                onClick={() => setFormat("voucher")}
                title="Formato tirilla térmica de 80 mm para impresora POS"
              >
                <Receipt size={15} />
                <span>Baucher (80 mm)</span>
              </button>
            </div>

            <button
              type="button"
              className="inv-btn inv-btn--ghost inv-btn--icon"
              onClick={onClose}
              title="Cerrar ventana"
              style={{ padding: "4px", border: "none", background: "transparent", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Vista Previa del Documento */}
        <div
          className="inv-modal__body no-print"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: "#64748b",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
              borderRadius: "4px",
              background: "#ffffff",
              padding: format === "half_letter" ? "12px" : "4px",
              maxWidth: "100%",
            }}
          >
            {format === "voucher" ? renderVoucherContent() : renderHalfLetterContent()}
          </div>
        </div>

        {/* Acciones */}
        <div
          className="inv-modal__actions no-print"
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderTop: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            Formato activo: <strong>{format === "voucher" ? "Baucher / Tirilla POS (80 mm)" : "Media Carta"}</strong>
          </span>

          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="inv-btn inv-btn--secondary" onClick={onClose}>
              Cerrar
            </button>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={handlePrint}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Printer size={16} />
              {format === "voucher" ? "Imprimir Baucher" : "Imprimir Media Carta"}
            </button>
          </div>
        </div>
      </div>

      {/* PORTAL PARA IMPRESIÓN DIRECTA FUERA DEL ÁRBOL DE COMPONENTES */}
      {portalReady &&
        createPortal(
          <>
            <div id="inv-layaway-payment-ticket-print" aria-hidden="true">
              {renderVoucherContent()}
            </div>
            <div id="inv-layaway-payment-half-letter-print" aria-hidden="true">
              {renderHalfLetterContent()}
            </div>
          </>,
          document.body
        )}

      {/* ESTILOS DE IMPRESIÓN DIRECTA AISLADA */}
      <style>{`
        #inv-layaway-payment-ticket-print,
        #inv-layaway-payment-half-letter-print {
          display: none;
        }

        @media print {
          html, body {
            height: auto !important;
            min-height: 0 !important;
            max-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          #root {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          /* 1. MODO BAUCHER / TIRILLA POS */
          body.inv-printing-layaway-ticket {
            overflow: hidden !important;
          }

          body.inv-printing-layaway-ticket > *:not(#inv-layaway-payment-ticket-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          body.inv-printing-layaway-ticket #inv-layaway-payment-ticket-print {
            display: block !important;
            position: static !important;
            width: 70mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          body.inv-printing-layaway-ticket #inv-layaway-payment-ticket-print .layaway-ticket-body {
            display: block !important;
            width: 70mm !important;
            max-width: 70mm !important;
            margin: 0 !important;
            padding: 2mm 2.5mm 3mm 2.5mm !important;
            box-sizing: border-box !important;
            color: #000000 !important;
            background: #ffffff !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* 2. MODO MEDIA CARTA */
          body.inv-printing-layaway-half-letter > *:not(#inv-layaway-payment-half-letter-print) {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
          }

          body.inv-printing-layaway-half-letter #inv-layaway-payment-half-letter-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 185mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body.inv-printing-layaway-half-letter #inv-layaway-payment-half-letter-print .layaway-half-letter-body {
            display: block !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 6mm 8mm !important;
            box-sizing: border-box !important;
            color: #0f172a !important;
            background: #ffffff !important;
            border: 1px solid #94a3b8 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
