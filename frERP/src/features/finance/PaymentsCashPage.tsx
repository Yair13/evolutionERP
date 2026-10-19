import { useCallback, useEffect, useState } from "react";
import { fetchPaymentsCashSummary, type PaymentsCashSummary } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { PiggyBank, RefreshCw } from "lucide-react";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const METHOD_STYLE: Record<
  string,
  { bg: string; border: string; color: string; icon: string }
> = {
  efectivo: {
    bg: "rgba(16, 185, 129, 0.08)",
    border: "rgba(16, 185, 129, 0.25)",
    color: "#10b981",
    icon: "💵",
  },
  bancolombia: {
    bg: "rgba(245, 158, 11, 0.08)",
    border: "rgba(245, 158, 11, 0.25)",
    color: "#f59e0b",
    icon: "🟡",
  },
  davivienda: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.25)",
    color: "#ef4444",
    icon: "🔴",
  },
  nequi: {
    bg: "rgba(168, 85, 247, 0.08)",
    border: "rgba(168, 85, 247, 0.25)",
    color: "#a855f7",
    icon: "🟣",
  },
  daviplata: {
    bg: "rgba(244, 63, 94, 0.08)",
    border: "rgba(244, 63, 94, 0.25)",
    color: "#f43f5e",
    icon: "📱",
  },
  bold: {
    bg: "rgba(59, 130, 246, 0.08)",
    border: "rgba(59, 130, 246, 0.25)",
    color: "#3b82f6",
    icon: "🔵",
  },
  addi: {
    bg: "rgba(34, 197, 94, 0.08)",
    border: "rgba(34, 197, 94, 0.25)",
    color: "#22c55e",
    icon: "🟢",
  },
  sistecredito: {
    bg: "rgba(14, 165, 233, 0.08)",
    border: "rgba(14, 165, 233, 0.25)",
    color: "#0ea5e9",
    icon: "💳",
  },
  saldo_a_favor: {
    bg: "rgba(99, 102, 241, 0.08)",
    border: "rgba(99, 102, 241, 0.25)",
    color: "#6366f1",
    icon: "💰",
  },
  otro: {
    bg: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.1)",
    color: "var(--text-primary)",
    icon: "🪙",
  },
};

export function PaymentsCashPage() {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();
  const canSeeAll =
    isAllWarehouses || user?.roles.includes("super_admin") || user?.roles.includes("secretaria");

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? "" : warehouseId || ""
  );
  const [dateFrom, setDateFrom] = useState(localTodayYmd);
  const [dateTo, setDateTo] = useState(localTodayYmd);
  const [data, setData] = useState<PaymentsCashSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPaymentsCashSummary(token, {
        warehouseId: selectedWarehouseId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Error al cargar arqueo de pagos");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Atajos de fecha
  function setPeriod(type: "today" | "yesterday" | "month") {
    const today = new Date();
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (type === "today") {
      const t = ymd(today);
      setDateFrom(t);
      setDateTo(t);
    } else if (type === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const str = ymd(y);
      setDateFrom(str);
      setDateTo(str);
    } else if (type === "month") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(ymd(first));
      setDateTo(ymd(today));
    }
  }

  return (
    <div className="container" style={{ paddingBottom: "3rem" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.25rem 0", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <PiggyBank size={28} className="text-primary" />
            Caja y Medios de Pago · Arqueo
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Control de ingresos recaudados por Efectivo, Bancos, Bold, Addi y billeteras digitales
          </p>
        </div>

        {/* Atajos rápidos de fecha */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            style={{ fontSize: "0.8rem", padding: "5px 10px" }}
            onClick={() => setPeriod("today")}
          >
            Hoy
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            style={{ fontSize: "0.8rem", padding: "5px 10px" }}
            onClick={() => setPeriod("yesterday")}
          >
            Ayer
          </button>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            style={{ fontSize: "0.8rem", padding: "5px 10px" }}
            onClick={() => setPeriod("month")}
          >
            Este Mes
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div style={{ background: "var(--bg-card-subtle, rgba(255,255,255,0.03))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        {canSeeAll && (
          <label className="field" style={{ margin: 0, minWidth: 180 }}>
            <span>Sede</span>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              style={{ height: 38 }}
            >
              <option value="">Todas las Sedes</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field" style={{ margin: 0 }}>
          <span>Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ height: 38 }}
          />
        </label>

        <label className="field" style={{ margin: 0 }}>
          <span>Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ height: 38 }}
          />
        </label>

        <div style={{ alignSelf: "flex-end" }}>
          <button
            type="button"
            className="inv-btn inv-btn--ghost"
            style={{ height: 38, padding: "0 12px" }}
            onClick={() => void load()}
            title="Refrescar"
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Gran Total Recaudado y Cuadre de Cierre de Caja en Efectivo */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          {/* Total Recaudado Global */}
          <div style={{ background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: 12, padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                Total Recaudado en el Periodo
              </span>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "var(--text-primary)" }}>
                {formatMoney(data.totalCollected)}
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {dateFrom === dateTo ? `Día: ${dateFrom}` : `Rango: ${dateFrom} a ${dateTo}`}
              </span>
            </div>

            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Medios con movimiento:</span>
              <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                {data.methods.filter((m) => m.totalAmount > 0).length} de {data.methods.length}
              </div>
            </div>
          </div>

          {/* Cuadre de Efectivo para Cierre de Caja */}
          <div style={{ background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)", border: "1px solid rgba(245, 158, 11, 0.35)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                💵 Efectivo Neto para el Cierre de Caja
              </span>
              <span style={{ fontSize: "0.75rem", background: "rgba(245, 158, 11, 0.2)", color: "#fde68a", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                Cuadre en Caja
              </span>
            </div>

            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#10b981", marginBottom: "0.5rem" }}>
              {formatMoney(data.netCashInDrawer ?? data.cashCollected ?? 0)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.78rem", borderTop: "1px dashed rgba(245, 158, 11, 0.25)", paddingTop: "0.5rem" }}>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Ingresos Efectivo:</span>
                <strong style={{ color: "var(--text-primary)" }}>{formatMoney(data.cashCollected ?? 0)}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>(-) Nómina Efectivo:</span>
                <strong style={{ color: "#ef4444" }}>- {formatMoney(data.cashPayrollAmount ?? 0)}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>(-) Egresos / Vales:</span>
                <strong style={{ color: "#ef4444" }}>- {formatMoney(data.cashOutflowsAmount ?? 0)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          Cargando arqueo de caja…
        </div>
      ) : error ? (
        <div style={{ padding: "2rem", color: "#ef4444", textAlign: "center" }}>{error}</div>
      ) : data ? (
        <>
          {/* Tarjetas por cada Medio de Pago */}
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.85rem 0" }}>
            Desglose por Método de Pago
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            {data.methods.map((m) => {
              const style = METHOD_STYLE[m.method] || METHOD_STYLE.otro;
              return (
                <div
                  key={m.method}
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    borderRadius: 10,
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700, color: style.color, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span>{style.icon}</span> {m.label}
                      </span>
                      <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                        {m.transactionCount} movs
                      </span>
                    </div>

                    <div style={{ fontSize: "1.45rem", fontWeight: 800, marginBottom: "0.6rem" }}>
                      {formatMoney(m.totalAmount)}
                    </div>
                  </div>

                  {m.method === "efectivo" && (data.cashPayrollAmount || data.cashOutflowsAmount) ? (
                    <div style={{ paddingTop: "0.6rem", borderTop: "1px dashed rgba(255,255,255,0.1)", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                        <span>Recaudo bruto:</span>
                        <span>{formatMoney(m.totalAmount)}</span>
                      </div>
                      {Boolean(data.cashPayrollAmount) && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444" }}>
                          <span>(-) Nómina pagada:</span>
                          <span>- {formatMoney(data.cashPayrollAmount!)}</span>
                        </div>
                      )}
                      {Boolean(data.cashOutflowsAmount) && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444" }}>
                          <span>(-) Egresos caja:</span>
                          <span>- {formatMoney(data.cashOutflowsAmount!)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#10b981", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 3, marginTop: 2 }}>
                        <span>Neto en Caja (Cierre):</span>
                        <span>{formatMoney(data.netCashInDrawer ?? m.totalAmount)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ paddingTop: "0.6rem", borderTop: "1px dashed rgba(255,255,255,0.1)", fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                      <span>Ventas directas: <strong>{formatMoney(m.salesAmount)}</strong></span>
                      <span>Abonos: <strong style={{ color: "#10b981" }}>{formatMoney(m.creditsAmount)}</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tabla Comparativa de Medios de Pago */}
          <div style={{ background: "var(--bg-card, rgba(255,255,255,0.02))", border: "1px solid var(--border-color, rgba(255,255,255,0.08))", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.08))", fontWeight: 700, fontSize: "0.95rem" }}>
              Resumen Consolidado de Caja
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px" }}>Medio de Pago</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Ventas de Mostrador</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Abonos de Créditos</th>
                  <th style={{ padding: "10px 14px", textAlign: "center" }}>Movimientos</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Total en Medio</th>
                </tr>
              </thead>
              <tbody>
                {data.methods.map((m) => (
                  <tr key={m.method} style={{ borderTop: "1px solid var(--border-color, rgba(255,255,255,0.05))" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                      <span style={{ marginRight: 6 }}>{METHOD_STYLE[m.method]?.icon || "🪙"}</span>
                      {m.label}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      {formatMoney(m.salesAmount)}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "#10b981" }}>
                      {formatMoney(m.creditsAmount)}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      {m.transactionCount}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800 }}>
                      {formatMoney(m.totalAmount)}
                    </td>
                  </tr>
                ))}
                {/* Total */}
                <tr style={{ background: "rgba(255,255,255,0.06)", borderTop: "2px solid var(--border-color, rgba(255,255,255,0.15))", fontWeight: 800 }}>
                  <td style={{ padding: "12px 14px" }}>TOTAL RECAUDADO</td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {formatMoney(data.methods.reduce((s, m) => s + m.salesAmount, 0))}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right", color: "#10b981" }}>
                    {formatMoney(data.methods.reduce((s, m) => s + m.creditsAmount, 0))}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    {data.methods.reduce((s, m) => s + m.transactionCount, 0)}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontSize: "1.05rem", color: "#10b981" }}>
                    {formatMoney(data.totalCollected)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
