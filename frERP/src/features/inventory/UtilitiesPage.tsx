import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { fetchUtilitiesSummary } from "../../api/inventory.js";
import { Sparkline } from "../../components/ui/Sparkline.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import type { UtilitiesSummary } from "./inventory.types.js";

function money(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

export function UtilitiesPage() {
  const { token } = useAuth();
  const { warehouseId, isAllWarehouses, sessionLabel } = useWarehouse();
  const [data, setData] = useState<UtilitiesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveWh = isAllWarehouses ? null : warehouseId;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchUtilitiesSummary(token, effectiveWh ?? undefined);
      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, effectiveWh]);

  useEffect(() => {
    void load();
  }, [load]);

  const profitSpark = useMemo(
    () => (data ? data.profitTrend.map((p) => p.profit) : []),
    [data]
  );

  const scopeLabel = sessionLabel;

  return (
    <div className="inv-page inv-util">
      <header className="inv-page__header">
        <Link to="/app/inventario" className="inv-back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden />
          Inventario
        </Link>
        <div className="inv-page__title-row">
          <div>
            <h1 className="inv-page__title">
              <Wallet size={22} strokeWidth={2} aria-hidden />
              Utilidades
            </h1>
            <p className="inv-page__desc">Margen operativo · {scopeLabel}</p>
          </div>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="inv-page__desc">Calculando métricas…</p> : null}

      {data && !loading ? (
        <>
          <section className="inv-util__kpis" aria-label="Indicadores financieros">
            <article className="inv-util__kpi inv-util__kpi--hero">
              <span className="inv-util__kpi-label">Utilidad hoy</span>
              <strong className={data.today.profit >= 0 ? "is-pos" : "is-neg"}>
                {money(data.today.profit)}
              </strong>
              <span className="inv-util__kpi-meta">
                {data.today.documentCount} salidas · {data.today.salesUnits} uds
              </span>
            </article>
            <article className="inv-util__kpi">
              <span className="inv-util__kpi-label">Ventas hoy</span>
              <strong>{money(data.today.revenue)}</strong>
            </article>
            <article className="inv-util__kpi">
              <span className="inv-util__kpi-label">Costo hoy</span>
              <strong>{money(data.today.cost)}</strong>
            </article>
            <article className="inv-util__kpi">
              <span className="inv-util__kpi-label">Gastos hoy</span>
              <strong>{money(data.today.expenses)}</strong>
            </article>
            <article className="inv-util__kpi inv-util__kpi--month">
              <span className="inv-util__kpi-label">Utilidad del mes</span>
              <strong className={data.month.profit >= 0 ? "is-pos" : "is-neg"}>
                {money(data.month.profit)}
              </strong>
              <span className="inv-util__kpi-meta">
                Ventas {money(data.month.revenue)} · Gastos {money(data.month.expenses)}
              </span>
            </article>
          </section>

          <section className="inv-util__panel">
            <div className="inv-util__panel-head">
              <div>
                <h2>Tendencia de utilidad</h2>
                <p>Últimos 14 días (salidas − costo − gastos operativos)</p>
              </div>
              <Sparkline values={profitSpark} className="inv-util__spark" />
            </div>
            <div className="inv-util__trend-chips">
              {data.profitTrend.map((p) => (
                <span key={p.date} className="inv-util__trend-chip">
                  <span>{p.date.slice(5)}</span>
                  <strong className={p.profit >= 0 ? "is-pos" : "is-neg"}>{money(p.profit)}</strong>
                </span>
              ))}
            </div>
          </section>

          <div className="inv-util__cols">
            <section className="inv-util__panel">
              <h2>
                <TrendingUp size={18} strokeWidth={2} aria-hidden />
                Más rentables (30 días)
              </h2>
              {data.topProfitable.length === 0 ? (
                <p className="inv-page__desc">Sin salidas registradas aún.</p>
              ) : (
                <ul className="inv-util__products">
                  {data.topProfitable.map((p, i) => (
                    <li key={p.productId}>
                      <span className="inv-util__rank">{i + 1}</span>
                      <div className="inv-util__prod-body">
                        <Link to={`/app/productos/${p.productId}`} className="inv-util__prod-name">
                          {p.name}
                        </Link>
                        <span className="inv-util__prod-meta">
                          {p.referenceCode} · {p.units} uds · margen {pct(p.marginPercent)}
                        </span>
                      </div>
                      <strong className="is-pos">{money(p.profit)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="inv-util__panel">
              <h2>
                <TrendingDown size={18} strokeWidth={2} aria-hidden />
                Menor margen (30 días)
              </h2>
              {data.lowMargin.length === 0 ? (
                <p className="inv-page__desc">Sin datos suficientes.</p>
              ) : (
                <ul className="inv-util__products">
                  {data.lowMargin.map((p) => (
                    <li key={p.productId}>
                      <div className="inv-util__prod-body">
                        <Link to={`/app/productos/${p.productId}`} className="inv-util__prod-name">
                          {p.name}
                        </Link>
                        <span className="inv-util__prod-meta">
                          Ventas {money(p.revenue)} · margen {pct(p.marginPercent)}
                        </span>
                      </div>
                      <strong className={p.profit < 0 ? "is-neg" : ""}>{money(p.profit)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
