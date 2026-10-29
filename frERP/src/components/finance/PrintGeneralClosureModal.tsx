import { Printer, X, FileSpreadsheet } from "lucide-react";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import type { GeneralClosureRecord } from "../../api/finance.js";

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

type Props = {
  closure: GeneralClosureRecord;
  onClose: () => void;
};

export function PrintGeneralClosureModal({ closure, onClose }: Props) {
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
          maxWidth: 780,
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
            <FileSpreadsheet size={20} className="text-primary" />
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>
              Cierre Contable General · {closure.closureCode}
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
          className="printable-general-closure"
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
              .printable-general-closure, .printable-general-closure * { visibility: visible; }
              .printable-general-closure {
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
                ACTA OFICIAL DE CIERRE CONTABLE GENERAL
              </div>
              <div style={{ fontSize: "0.85rem", color: "#334155", marginTop: 4 }}>
                <strong>Sede:</strong> {closure.warehouseName ? `${closure.warehouseName} (${closure.warehouseCode})` : "Consolidado General (Todas las sedes)"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  display: "inline-block",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  color: "#0f172a",
                  marginBottom: 4,
                }}
              >
                {closure.closureCode}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Período: <strong>{closure.dateFrom}</strong> al <strong>{closure.dateTo}</strong>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Fecha emisión: {closure.createdAt ? formatBogotaDateTime(closure.createdAt) : "—"}
              </div>
            </div>
          </div>

          {/* Tarjetas clave del Cierre */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "0.75rem",
                background: "#f8fafc",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Ventas Totales del Período</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                {formatMoney(closure.totalSales)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: 4 }}>
                Efectivo: <strong>{formatMoney(closure.totalCashSales)}</strong><br />
                Bancos/Digital: <strong>{formatMoney(closure.totalBankSales)}</strong>
              </div>
            </div>

            {(closure.totalOtherIncomes ?? 0) > 0 && (
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "0.75rem",
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Otros Ingresos (Caja / Bancos)</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#059669", marginTop: 2 }}>
                  + {formatMoney(closure.totalOtherIncomes ?? 0)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: 4 }}>
                  Efectivo: <strong>{formatMoney(closure.totalCashOtherIncomes ?? 0)}</strong><br />
                  Digital: <strong>{formatMoney((closure.totalOtherIncomes ?? 0) - (closure.totalCashOtherIncomes ?? 0))}</strong>
                </div>
              </div>
            )}

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "0.75rem",
                background: "#f8fafc",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Efectivo Neto Operativo</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0284c7", marginTop: 2 }}>
                {formatMoney(closure.totalNetCash)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: 4 }}>
                Egresos: {formatMoney(closure.totalOutflows)}<br />
                Nómina: {formatMoney(closure.totalPayroll)}
              </div>
            </div>

            <div
              style={{
                border: "2px solid #6366f1",
                borderRadius: 8,
                padding: "0.75rem",
                background: "rgba(99, 102, 241, 0.05)",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#4f46e5", fontWeight: 700 }}>LIQUIDACIÓN DE CAJA / RETIRO</div>
              <div style={{ fontSize: "0.75rem", color: "#334155", marginTop: 4, lineHeight: "1.35" }}>
                Saldo de Arranque en Efectivo: <strong>{formatMoney(closure.openingCash ?? 0)}</strong><br />
                Total en Caja: <strong>{formatMoney(closure.totalCashAvailable ?? ((closure.openingCash ?? 0) + closure.totalNetCash))}</strong><br />
                Fondo dejado en sede: <strong>{formatMoney(closure.cashToKeep)}</strong>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#16a34a", marginTop: 4 }}>
                Retirar: {formatMoney(closure.cashToWithdraw)}
              </div>
            </div>
          </div>

          {/* Desglose por Medio de Pago */}
          <div style={{ marginBottom: "1.25rem" }}>
            <h4
              style={{
                margin: "0 0 0.5rem 0",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#1e293b",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Desglose Consolidado por Medios de Pago
            </h4>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1" }}>Medio</th>
                  <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>Ventas</th>
                  <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>Cartera / Apartados</th>
                  <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>Total Recaudado</th>
                  <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1", textAlign: "center" }}>Transacciones</th>
                </tr>
              </thead>
              <tbody>
                {closure.paymentBreakdown && closure.paymentBreakdown.length > 0 ? (
                  closure.paymentBreakdown.map((item, idx) => (
                    <tr
                      key={item.method}
                      style={{
                        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: item.method === "efectivo" ? 700 : 500 }}>
                        {item.label}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        {formatMoney(item.salesAmount)}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        {formatMoney(item.creditsAmount)}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>
                        {formatMoney(item.totalAmount)}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", color: "#64748b" }}>
                        {item.count}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#64748b" }}>
                      No se registraron movimientos en este período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notas u Observaciones */}
          {closure.notes && (
            <div
              style={{
                marginBottom: "1.5rem",
                padding: "0.6rem 0.8rem",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.8rem",
              }}
            >
              <strong>Observaciones del Cierre:</strong> {closure.notes}
            </div>
          )}

          {/* Firmas */}
          <div
            style={{
              marginTop: "2.5rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "3rem",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #475569", marginBottom: 6, height: 36 }}></div>
              <div style={{ fontWeight: 700, fontSize: "0.8rem" }}>
                {closure.createdByName ?? "Responsable de Cierre"}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Administrador de Sede / Cajero General</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderBottom: "1px solid #475569", marginBottom: 6, height: 36 }}></div>
              <div style={{ fontWeight: 700, fontSize: "0.8rem" }}>Revisado y Aprobado</div>
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Contabilidad / Gerencia</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
