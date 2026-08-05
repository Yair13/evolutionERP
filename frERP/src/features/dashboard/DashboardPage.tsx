import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../../components/ui/Panel.js";
import { QuickAction } from "../../components/ui/QuickAction.js";
import { Sparkline } from "../../components/ui/Sparkline.js";
import { StatCard } from "../../components/ui/StatCard.js";
import { useAuth } from "../../context/AuthContext.js";
import { movementTypeLabel } from "./movement-labels.js";
import { useDashboardSummary } from "./useDashboardSummary.js";
import { useSystemHealth } from "./useSystemHealth.js";

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function formatQty(q: string): string {
  const n = Number(q);
  if (Number.isNaN(n)) return q;
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(n);
}

const UNRESTRICTED_ROLES = new Set(["super_admin", "secretaria"]);

export function DashboardPage() {
  const { user, token } = useAuth();
  const { state, reload } = useDashboardSummary(token);
  const health = useSystemHealth();
  const isUnrestricted = useMemo(
    () => (user?.roles ?? []).some((r) => UNRESTRICTED_ROLES.has(r)),
    [user?.roles]
  );

  const trendValues = useMemo(() => {
    if (state.status !== "ok") return [];
    return state.data.movementTrend.map((p) => p.count);
  }, [state]);

  const healthLabel = useMemo(() => {
    if (health.status === "loading") return "Comprobando…";
    if (health.status === "error") return "Sin conexión al API";
    const db = health.payload?.database;
    if (!db || "skipped" in db) return "Base de datos no configurada en API";
    if (db.ok) return `Operativa · ${db.latencyMs} ms`;
    return "Incidencia en base de datos";
  }, [health]);

  const healthTone =
    health.status === "ok" && health.payload?.database && "ok" in health.payload.database && health.payload.database.ok
      ? "ok"
      : health.status === "loading"
        ? "pending"
        : "bad";

  return (
    <div className="dashboard">
      <section className="dash-hero">
        <div className="dash-hero__mesh" aria-hidden />
        <div className="dash-hero__content">
          <p className="dash-kicker">Centro de operaciones</p>
          <h1 className="dash-title">
            Hola, <span className="dash-title__accent">{user?.fullName}</span>
          </h1>
          <p className="dash-lead">
            Vista operativa con datos reales del backend: inventario por movimientos, sedes y actividad reciente. Pensada
            para escalar a más módulos sin perder claridad.
          </p>
          <div className="dash-hero__row">
            <div className={`health-pill health-pill--${healthTone}`}>
              <span className="health-pill__dot" aria-hidden />
              <span className="health-pill__text">{healthLabel}</span>
            </div>
            {isUnrestricted ? (
              <span className="dash-scope-pill" title="Tu rol concede acceso a todas las sedes">
                <span className="dash-scope-pill__dot" aria-hidden />
                Acceso total · todas las sedes
              </span>
            ) : null}
            {state.status === "ok" ? (
              <span className="dash-meta">Actualizado · {formatWhen(state.data.generatedAt)}</span>
            ) : null}
          </div>
        </div>
        <div className="dash-hero__actions">
          <p className="dash-actions-title">Accesos rápidos</p>
          <div className="quick-actions">
            {user?.roles.includes("super_admin") ? (
              <QuickAction label="Gestionar sedes" to="/app/configuracion/almacenes" hint="Crear o editar almacenes de la empresa" />
            ) : null}
            <QuickAction label="Productos" to="/app/productos" hint="Catálogo de toda la empresa" />
            <QuickAction label="Entrada de stock" to="/app/inventario/entrada" hint="Recepción visual con escáner" />
            <QuickAction label="Salida de stock" to="/app/inventario/salida" hint="Punto de venta interno" />
            {user?.roles.includes("super_admin") ? (
              <QuickAction label="Utilidades" to="/app/inventario/utilidades" hint="Margen y rentabilidad" />
            ) : null}
            <QuickAction label="Cierre del día" disabled hint="Validaciones y consolidado" />
          </div>
        </div>
      </section>

      {state.status === "loading" ? <p className="muted dash-loading">Sincronizando métricas…</p> : null}
      {state.status === "error" ? (
        <div className="dash-banner dash-banner--error">
          <div>
            <strong>No se pudo cargar el panel.</strong> <span className="muted">{state.message}</span>
          </div>
          <button type="button" className="btn primary" onClick={() => void reload()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {state.status === "ok" ? (
        <>
          <section className="bento" aria-label="Indicadores clave">
            <StatCard
              label="Sedes activas"
              value={formatInt(state.data.kpis.activeWarehouses)}
              hint={state.data.scope === "all" ? "Visión corporativa · todas las sedes" : "Alcance asignado a tu usuario"}
            />
            <StatCard
              label="Productos activos"
              value={formatInt(state.data.kpis.activeProducts)}
              hint="Catálogo maestro disponible para operación"
            />
            <StatCard
              label="Movimientos hoy"
              value={formatInt(state.data.kpis.movementsToday)}
              hint="Entradas, salidas y ajustes registrados hoy"
              tone="accent"
            />
            <StatCard
              label="Últimos 7 días"
              value={formatInt(state.data.kpis.movementsLast7Days)}
              hint="Ritmo operativo reciente"
            />
            <StatCard
              label="Posiciones con stock"
              value={formatInt(state.data.kpis.stockLocationsTracked)}
              hint="Combinaciones almacén × SKU con existencia"
            />
            <StatCard
              label="Alertas stock crítico"
              value={formatInt(state.data.kpis.attentionLowStock)}
              hint="Según umbrales por sede"
              tone={state.data.kpis.attentionLowStock > 0 ? "warn" : "default"}
            />
          </section>

          <section className="dash-grid">
            <Panel
              title="Actividad de movimientos"
              subtitle="Últimos 7 días · misma lógica de permisos que el resto del sistema"
              action={<Sparkline values={trendValues} />}
            >
              <div className="trend-legend">
                {state.data.movementTrend.map((p) => (
                  <div key={p.date} className="trend-chip">
                    <span className="trend-chip__d">{p.date.slice(5)}</span>
                    <span className="trend-chip__c">{formatInt(p.count)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Mapa rápido de sedes"
              subtitle={isUnrestricted ? "Top de sedes de la empresa (acceso total)" : "Top de almacenes visibles para tu sesión"}
            >
              {state.data.snapshotWarehouses.length === 0 ? (
                <p className="muted">No hay sedes en tu alcance todavía.</p>
              ) : (
                <ul className="wh-pills">
                  {state.data.snapshotWarehouses.map((w) => (
                    <li key={w.id} className="wh-pill">
                      <span className="wh-pill__code">{w.code}</span>
                      <span className="wh-pill__name">{w.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {user?.roles.includes("super_admin") ? (
                <Link className="text-link" to="/app/configuracion/almacenes">
                  Gestionar sedes (empresa) →
                </Link>
              ) : (
                <p className="muted dash-map-note">
                  El detalle por sede vivirá en <strong>Inventario</strong> cuando esté listo el módulo.
                </p>
              )}
            </Panel>
          </section>

          <Panel title="Línea de tiempo reciente" subtitle="Últimos movimientos de inventario (fuente: libro de movimientos)">
            {state.data.recentMovements.length === 0 ? (
              <p className="muted">
                Aún no hay movimientos registrados. Cuando conectemos entradas/salidas, aquí verás trazabilidad en vivo.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Cuándo</th>
                      <th>Sede</th>
                      <th>Tipo</th>
                      <th>Producto</th>
                      <th className="num">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.recentMovements.map((m) => (
                      <tr key={m.id}>
                        <td>{formatWhen(m.at)}</td>
                        <td>
                          <span className="cell-strong">{m.warehouseCode}</span>{" "}
                          <span className="muted">{m.warehouseName}</span>
                        </td>
                        <td>
                          <span className="type-pill">{movementTypeLabel(m.type)}</span>
                        </td>
                        <td>
                          <div className="cell-stack">
                            <span className="cell-strong">{m.productName}</span>
                            <span className="muted mono">{m.productRef}</span>
                          </div>
                        </td>
                        <td className="num">{formatQty(m.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
