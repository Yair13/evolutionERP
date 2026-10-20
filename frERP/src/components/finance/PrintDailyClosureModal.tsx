import { Printer, X, FileText } from "lucide-react";
import type { DailyClosureRecord } from "../../api/finance.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  closure: DailyClosureRecord;
  onClose: () => void;
};

export function PrintDailyClosureModal({ closure, onClose }: Props) {
  const isBalanced = closure.cashDifference === 0;
  const isShort = closure.cashDifference < 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          color: "#111827",
          borderRadius: 12,
          maxWidth: 720,
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de acciones (no-print) */}
        <div
          className="no-print"
          style={{
            padding: "0.85rem 1.25rem",
            background: "#1e293b",
            color: "#ffffff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileText size={20} className="text-primary" />
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>
              Acta de Cierre Diario · {closure.closingVoucherNumber}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              onClick={() => window.print()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
                padding: "6px 14px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <Printer size={16} /> Imprimir Acta
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenido imprimible */}
        <div
          className="printable-daily-closure"
          style={{
            padding: "2rem",
            overflowY: "auto",
            fontSize: "0.85rem",
            lineHeight: 1.45,
            fontFamily: "Arial, sans-serif",
          }}
        >
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .no-print { display: none !important; }
              .printable-daily-closure, .printable-daily-closure * { visibility: visible; }
              .printable-daily-closure {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                padding: 0.5cm !important;
                margin: 0 !important;
                color: #000 !important;
                background: #fff !important;
              }
            }
          `}</style>

          {/* Encabezado */}
          <div
            style={{
              borderBottom: "2px solid #0f172a",
              paddingBottom: "1rem",
              marginBottom: "1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 2px 0", fontSize: "1.3rem", fontWeight: 900, letterSpacing: -0.5 }}>
                EVOLUTION ERP
              </h2>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                ACTA OFICIAL DE CIERRE DIARIO Y ARQUEO DE CAJA
              </div>
              <div style={{ fontSize: "0.85rem", color: "#334155", marginTop: 4 }}>
                <strong>Sede:</strong> {closure.warehouseName ?? "Sede"} ({closure.warehouseCode ?? "MAIN"})
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: "1rem",
                  color: "#0f172a",
                }}
              >
                {closure.closingVoucherNumber}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 4 }}>
                Fecha Cierre: <strong>{closure.closureDate}</strong> {closure.shiftNumber ? `· Turno ${closure.shiftNumber}` : ""}
              </div>
              {closure.startedAt && (
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Horario: {new Date(closure.startedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} → {closure.closedAt ? new Date(closure.closedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "Cierre"}
                </div>
              )}
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Cajero: {closure.cashierName ?? closure.createdByName ?? "—"}
              </div>
            </div>
          </div>

          {/* Estado de Cuadre */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 1rem",
              borderRadius: 8,
              marginBottom: "1.25rem",
              background: isBalanced ? "#ecfdf5" : isShort ? "#fef2f2" : "#eff6ff",
              border: `1px solid ${isBalanced ? "#a7f3d0" : isShort ? "#fecaca" : "#bfdbfe"}`,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: isBalanced ? "#166534" : isShort ? "#991b1b" : "#1e40af" }}>
                {isBalanced ? "✓ CUADRE DE CAJA EXACTO" : isShort ? "⚠️ FALTANTE EN CAJA" : "ℹ️ SOBRANTE EN CAJA"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                Efectivo Esperado: {formatMoney(closure.expectedCash)} vs Efectivo Físico Contado: {formatMoney(closure.countedCash)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#64748b" }}>
                Diferencia
              </span>
              <div style={{ fontSize: "1.25rem", fontWeight: 900, color: isBalanced ? "#16a34a" : isShort ? "#dc2626" : "#2563eb" }}>
                {closure.cashDifference > 0 ? `+ ${formatMoney(closure.cashDifference)}` : formatMoney(closure.cashDifference)}
              </div>
            </div>
          </div>

          {/* Cuadro de Liquidación de Efectivo */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
                <th style={{ padding: "8px 10px" }}>Concepto de Efectivo</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Entradas (+)</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Salidas (-)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px 10px" }}>
                  <strong>Saldo de Arranque en Efectivo (Base)</strong>
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>
                  {formatMoney(closure.openingCash)}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px 10px" }}>Ventas de Mostrador en Efectivo</td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                  + {formatMoney(closure.cashSales)}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
              </tr>
              {closure.cashCreditPayments > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Abonos de Créditos de Clientes en Efectivo</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                    + {formatMoney(closure.cashCreditPayments)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                </tr>
              )}
              {closure.cashLayawayPayments > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Abonos a Planes Separe (Apartados) en Efectivo</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                    + {formatMoney(closure.cashLayawayPayments)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                </tr>
              )}
              {closure.cashTransfersReceived > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Remesas / Traslados de Dinero Recibidos en Efectivo</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                    + {formatMoney(closure.cashTransfersReceived)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                </tr>
              )}
              {closure.cashOutflows > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Comprobantes de Egreso (Caja Menor) en Efectivo</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                    - {formatMoney(closure.cashOutflows)}
                  </td>
                </tr>
              )}
              {closure.cashPayroll > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Pagos de Nómina Realizados en Efectivo</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                    - {formatMoney(closure.cashPayroll)}
                  </td>
                </tr>
              )}
              {closure.cashTransfersSent > 0 && (
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 10px" }}>Remesas / Traslados Enviados a Otras Sedes</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#94a3b8" }}>—</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                    - {formatMoney(closure.cashTransfersSent)}
                  </td>
                </tr>
              )}
              <tr style={{ background: "#f8fafc", borderTop: "2px solid #0f172a" }}>
                <td style={{ padding: "10px", fontWeight: 800 }}>EFECTIVO NETO ESPERADO EN CAJA</td>
                <td colSpan={2} style={{ padding: "10px", textAlign: "right", fontWeight: 800, fontSize: "1rem" }}>
                  {formatMoney(closure.expectedCash)}
                </td>
              </tr>
              <tr style={{ background: "#f1f5f9", borderTop: "1px solid #cbd5e1" }}>
                <td style={{ padding: "10px", fontWeight: 800 }}>EFECTIVO FÍSICO CONTADO POR EL CAJERO</td>
                <td colSpan={2} style={{ padding: "10px", textAlign: "right", fontWeight: 900, fontSize: "1.1rem", color: "#0284c7" }}>
                  {formatMoney(closure.countedCash)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Resumen de Medios Digitales y Bancos */}
          <div
            style={{
              padding: "0.85rem 1rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              marginBottom: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Recaudo por Cuentas Bancarias / Pasarelas (Bancolombia, Davivienda, Bold, Addi, Nequi...)
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Soportes digitales auditados: {closure.pendingReceiptsCount === 0 ? "100% Adjuntos" : `${closure.pendingReceiptsCount} pendientes`}
              </div>
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>
              {formatMoney(closure.bankPaymentsTotal)}
            </div>

            {closure.paymentBreakdown && closure.paymentBreakdown.length > 0 && (
              <div style={{ marginTop: "0.75rem", width: "100%", borderTop: "1px dashed #cbd5e1", paddingTop: "0.5rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 4, textTransform: "uppercase" }}>
                  Desglose por Entidad Bancaria / Pasarela:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
                  {closure.paymentBreakdown.map((pb) => (
                    <div key={pb.method} style={{ background: "#ffffff", padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: "0.8rem", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600, color: "#334155" }}>{pb.label}:</span>
                      <strong style={{ color: "#0f172a" }}>{formatMoney(pb.amount)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {closure.notes && (
            <div style={{ fontSize: "0.8rem", color: "#475569", marginBottom: "1.5rem" }}>
              <strong>Observaciones del Cierre:</strong> {closure.notes}
            </div>
          )}

          {/* Firmas Formales */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2.5rem",
              marginTop: "3rem",
              paddingTop: "1rem",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #0f172a", height: 50, marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>RESPONSABLE DE CAJA / CAJERO</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {closure.cashierName ?? closure.createdByName ?? "Cajero de Turno"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Sede: {closure.warehouseName}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #0f172a", height: 50, marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>VERIFICADOR / ADMINISTRACIÓN</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Firma y Cédula
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Aprobación de Cierre y Arqueo
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
