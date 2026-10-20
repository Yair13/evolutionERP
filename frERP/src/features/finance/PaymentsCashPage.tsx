import { useCallback, useEffect, useState } from "react";
import { fetchPaymentsCashSummary, type PaymentsCashSummary } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import {
  getTodayBogotaYmd,
  getYesterdayBogotaYmd,
  getFirstDayOfMonthBogotaYmd,
} from "../../lib/dateUtils.js";
import {
  PiggyBank,
  RefreshCw,
  Wallet,
  CreditCard,
  CheckCircle2,
  Receipt,
} from "lucide-react";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  return getTodayBogotaYmd();
}

const METHOD_STYLE: Record<
  string,
  { bg: string; border: string; color: string; icon: string; brandColor: string }
> = {
  efectivo: {
    bg: "rgba(5, 150, 105, 0.05)",
    border: "rgba(5, 150, 105, 0.22)",
    color: "#059669",
    brandColor: "#059669",
    icon: "💵",
  },
  bancolombia: {
    bg: "rgba(217, 119, 6, 0.05)",
    border: "rgba(217, 119, 6, 0.22)",
    color: "#d97706",
    brandColor: "#d97706",
    icon: "🟡",
  },
  davivienda: {
    bg: "rgba(225, 29, 72, 0.05)",
    border: "rgba(225, 29, 72, 0.22)",
    color: "#e11d48",
    brandColor: "#e11d48",
    icon: "🔴",
  },
  nequi: {
    bg: "rgba(124, 58, 237, 0.05)",
    border: "rgba(124, 58, 237, 0.22)",
    color: "#7c3aed",
    brandColor: "#7c3aed",
    icon: "🟣",
  },
  daviplata: {
    bg: "rgba(225, 29, 72, 0.05)",
    border: "rgba(225, 29, 72, 0.22)",
    color: "#e11d48",
    brandColor: "#e11d48",
    icon: "📱",
  },
  bold: {
    bg: "rgba(2, 132, 199, 0.05)",
    border: "rgba(2, 132, 199, 0.22)",
    color: "#0284c7",
    brandColor: "#0284c7",
    icon: "🔵",
  },
  addi: {
    bg: "rgba(13, 148, 136, 0.05)",
    border: "rgba(13, 148, 136, 0.22)",
    color: "#0d9488",
    brandColor: "#0d9488",
    icon: "🟢",
  },
  sistecredito: {
    bg: "rgba(2, 132, 199, 0.05)",
    border: "rgba(2, 132, 199, 0.22)",
    color: "#0284c7",
    brandColor: "#0284c7",
    icon: "💳",
  },
  saldo_a_favor: {
    bg: "rgba(79, 70, 229, 0.05)",
    border: "rgba(79, 70, 229, 0.22)",
    color: "#4f46e5",
    brandColor: "#4f46e5",
    icon: "💰",
  },
  otro: {
    bg: "rgba(100, 116, 139, 0.05)",
    border: "rgba(100, 116, 139, 0.2)",
    color: "#475569",
    brandColor: "#475569",
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

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
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

  // Atajos rápidos de fecha
  function setPeriod(type: "today" | "yesterday" | "month") {
    if (type === "today") {
      const t = getTodayBogotaYmd();
      setDateFrom(t);
      setDateTo(t);
    } else if (type === "yesterday") {
      const y = getYesterdayBogotaYmd();
      setDateFrom(y);
      setDateTo(y);
    } else if (type === "month") {
      setDateFrom(getFirstDayOfMonthBogotaYmd());
      setDateTo(getTodayBogotaYmd());
    }
  }

  // Cálculos derivados
  const digitalCollected = data
    ? data.methods
        .filter((m) => m.method !== "efectivo")
        .reduce((sum, m) => sum + m.totalAmount, 0)
    : 0;

  const totalTransactions = data
    ? data.methods.reduce((sum, m) => sum + m.transactionCount, 0)
    : 0;

  return (
    <div className="fin-page">
      {/* Encabezado */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge">
              <PiggyBank size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Caja y Medios de Pago · Arqueo</h1>
              <p className="fin-header__subtitle">
                Arqueo consolidado de cobros, recaudos en efectivo, transferencias bancarias, datáfonos y créditos.
              </p>
            </div>
          </div>
        </div>

        {/* Atajos Rápidos de Período */}
        <div className="fin-header__actions">
          <div className="fin-period-group">
            <button
              type="button"
              className="fin-period-btn"
              onClick={() => setPeriod("today")}
            >
              Hoy
            </button>
            <button
              type="button"
              className="fin-period-btn"
              onClick={() => setPeriod("yesterday")}
            >
              Ayer
            </button>
            <button
              type="button"
              className="fin-period-btn"
              onClick={() => setPeriod("month")}
            >
              Este Mes
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="fin-filter-card">
        {canSeeAll ? (
          <div className="fin-filter-field" style={{ minWidth: 200 }}>
            <span>Sede</span>
            <select
              className="fin-select"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
            >
              <option value="">Todas las Sedes</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="fin-filter-field" style={{ minWidth: 160 }}>
            <span>SEDE</span>
            <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)", fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-primary)" }}>
              {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
            </div>
          </div>
        )}

        <div className="fin-filter-field" style={{ minWidth: 150 }}>
          <span>Desde</span>
          <input
            className="fin-input"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="fin-filter-field" style={{ minWidth: 150 }}>
          <span>Hasta</span>
          <input
            className="fin-input"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="fin-filter-field fin-filter-field--fixed">
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => void load()}
            title="Actualizar datos de caja"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {data && (
        <div className="fin-kpi-grid fin-kpi-grid--4">
          {/* 1. Total Recaudado Global */}
          <div className="fin-kpi-card fin-kpi-card--emerald">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Total Recaudado</span>
              <div className="fin-kpi-icon fin-kpi-icon--emerald">
                <Receipt size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--emerald">
              {formatMoney(data.totalCollected)}
            </div>
            <div className="fin-kpi-sub">
              {dateFrom === dateTo ? `Día: ${dateFrom}` : `${dateFrom} al ${dateTo}`}
            </div>
          </div>

          {/* 2. Efectivo Neto en Caja */}
          <div className="fin-kpi-card fin-kpi-card--amber">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Efectivo Físico en Caja</span>
              <div className="fin-kpi-icon fin-kpi-icon--amber">
                <Wallet size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--amber">
              {formatMoney(data.netCashInDrawer ?? data.cashCollected ?? 0)}
            </div>
            <div className="fin-kpi-sub">
              Neto tras nómina y egresos
            </div>
          </div>

          {/* 3. Medios Digitales y Bancos */}
          <div className="fin-kpi-card fin-kpi-card--indigo">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Bancos y Digitales</span>
              <div className="fin-kpi-icon fin-kpi-icon--indigo">
                <CreditCard size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--indigo">
              {formatMoney(digitalCollected)}
            </div>
            <div className="fin-kpi-sub">
              Billeteras, Bold, Addi y transferencias
            </div>
          </div>

          {/* 4. Transacciones Realizadas */}
          <div className="fin-kpi-card fin-kpi-card--teal">
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Movimientos y Medios</span>
              <div className="fin-kpi-icon fin-kpi-icon--teal">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--teal">
              {totalTransactions}
            </div>
            <div className="fin-kpi-sub">
              {data.methods.filter((m) => m.totalAmount > 0).length} de {data.methods.length} medios con recaudo
            </div>
          </div>
        </div>
      )}

      {/* Alerta de Error */}
      {error && (
        <div className="fin-alert fin-alert--danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Contenido Principal */}
      {loading ? (
        <div className="fin-empty">
          <div className="fin-empty__icon">
            <RefreshCw size={24} className="spin" />
          </div>
          <h3 className="fin-empty__title">Cargando arqueo de caja</h3>
          <p className="fin-empty__desc">Consultando transacciones y recaudos del período seleccionado…</p>
        </div>
      ) : data ? (
        <>
          {/* Desglose por Tarjetas de Medios de Pago */}
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Desglose por Medio de Pago
            </h2>
            <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
              Participación sobre el total recaudado ({formatMoney(data.totalCollected)})
            </span>
          </div>

          <div className="fin-methods-grid">
            {data.methods.map((m) => {
              const style = METHOD_STYLE[m.method] || METHOD_STYLE.otro;
              const percent = data.totalCollected > 0
                ? Math.round((m.totalAmount / data.totalCollected) * 100)
                : 0;

              return (
                <div key={m.method} className="fin-method-card">
                  <div>
                    <div className="fin-method-card__top">
                      <div className="fin-method-card__brand">
                        <div className="fin-method-card__icon-wrap">
                          <span>{style.icon}</span>
                        </div>
                        <span className="fin-method-card__name">{m.label}</span>
                      </div>
                      <span className="fin-method-card__count-badge">
                        {m.transactionCount} {m.transactionCount === 1 ? "mov" : "movs"}
                      </span>
                    </div>

                    <div className="fin-method-card__amount" style={{ color: style.color }}>
                      {formatMoney(m.totalAmount)}
                    </div>

                    {/* Barra de progreso / participación */}
                    <div className="fin-method-card__bar-wrap">
                      <div
                        className="fin-method-card__bar-fill"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: style.brandColor,
                        }}
                      />
                    </div>
                    <div className="fin-method-card__footer">
                      <span>{percent}% del total</span>
                      <span>{m.transactionCount} operaciones</span>
                    </div>
                  </div>

                  {/* Detalle interno */}
                  <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(15, 23, 42, 0.07)", fontSize: "0.78rem" }}>
                    {m.method === "efectivo" && (data.cashPayrollAmount || data.cashOutflowsAmount) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                          <span>Recaudo bruto:</span>
                          <span style={{ fontWeight: 600 }}>{formatMoney(m.totalAmount)}</span>
                        </div>
                        {Boolean(data.cashPayrollAmount) && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#e11d48" }}>
                            <span>(-) Nómina en efectivo:</span>
                            <span style={{ fontWeight: 600 }}>- {formatMoney(data.cashPayrollAmount!)}</span>
                          </div>
                        )}
                        {Boolean(data.cashOutflowsAmount) && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#e11d48" }}>
                            <span>(-) Egresos de caja:</span>
                            <span style={{ fontWeight: 600 }}>- {formatMoney(data.cashOutflowsAmount!)}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: 700, borderTop: "1px dashed rgba(15, 23, 42, 0.1)", paddingTop: "0.35rem", marginTop: "0.2rem" }}>
                          <span>Neto en Caja:</span>
                          <span>{formatMoney(data.netCashInDrawer ?? m.totalAmount)}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                        <span>Ventas: <strong style={{ color: "#0f172a" }}>{formatMoney(m.salesAmount)}</strong></span>
                        <span>Abonos: <strong style={{ color: "#059669" }}>{formatMoney(m.creditsAmount)}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabla Consolidada de Caja */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <Receipt size={18} color="var(--accent)" />
                <span>Resumen Consolidado de Ingresos por Medio de Pago</span>
              </h3>
              <span className="fin-badge fin-badge--neutral">
                {data.methods.length} canales configurados
              </span>
            </div>

            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Medio de Pago</th>
                    <th style={{ textAlign: "right" }}>Ventas Mostrador</th>
                    <th style={{ textAlign: "right" }}>Abonos de Cartera</th>
                    <th style={{ textAlign: "center" }}>Movimientos</th>
                    <th style={{ textAlign: "right" }}>Total Recaudado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((m) => {
                    const style = METHOD_STYLE[m.method] || METHOD_STYLE.otro;
                    return (
                      <tr key={m.method}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span>{style.icon}</span>
                            <strong style={{ color: "#0f172a" }}>{m.label}</strong>
                          </div>
                        </td>
                        <td className="fin-table-num">
                          {formatMoney(m.salesAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669" }}>
                          {formatMoney(m.creditsAmount)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="fin-badge fin-badge--neutral">{m.transactionCount}</span>
                        </td>
                        <td className="fin-table-num" style={{ color: style.color, fontWeight: 800 }}>
                          {formatMoney(m.totalAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>TOTAL CONSOLIDADO</td>
                    <td className="fin-table-num">
                      {formatMoney(data.methods.reduce((s, m) => s + m.salesAmount, 0))}
                    </td>
                    <td className="fin-table-num" style={{ color: "#059669" }}>
                      {formatMoney(data.methods.reduce((s, m) => s + m.creditsAmount, 0))}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="fin-badge fin-badge--teal">{totalTransactions}</span>
                    </td>
                    <td className="fin-table-num" style={{ color: "#059669", fontSize: "1.05rem" }}>
                      {formatMoney(data.totalCollected)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
