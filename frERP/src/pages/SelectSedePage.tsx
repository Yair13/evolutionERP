import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Factory,
  Loader2,
  LogOut,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import { useWarehouse } from "../context/WarehouseContext.js";

export function SelectSedePage() {
  const { token, user, logout } = useAuth();
  const {
    assignedWarehouses,
    warehouseId,
    isAllWarehouses,
    hasSelectedScope,
    canViewAllWarehouses,
    setWarehouseId,
    loading,
    error,
    reload,
    sessionLabel,
  } = useWarehouse();
  const navigate = useNavigate();

  if (!token) return <Navigate to="/login" replace />;

  // Si es un usuario normal con una única sede asignada, omitir pantalla intermedia y entrar directo
  if (!loading && !canViewAllWarehouses && assignedWarehouses.length === 1) {
    return <Navigate to="/app" replace />;
  }

  function handleSelectAdminHeadquarters() {
    setWarehouseId(null);
    navigate("/app", { replace: true });
  }

  function handleSelectWarehouse(id: string) {
    setWarehouseId(id);
    navigate("/app", { replace: true });
  }

  return (
    <div className="auth-gate sede-gate">
      <div className="auth-gate__photo" aria-hidden />
      <div className="auth-gate__bg" aria-hidden />
      <div className="auth-gate__aurora" aria-hidden />
      <div className="auth-gate__grid" aria-hidden />
      <div className="auth-gate__vignette" aria-hidden />

      <div className="sede-picker">
        <header className="sede-picker__head">
          <div className="sede-picker__top-row">
            <span className="auth-hero__eyebrow sede-picker__eyebrow">
              <Sparkles size={14} strokeWidth={2} className="auth-hero__eyebrow-icon" aria-hidden />
              Selección de sede · Evolution ERP
            </span>
            <div className="sede-picker__top-actions">
              {hasSelectedScope ? (
                <button
                  type="button"
                  className="sede-picker__ghost-btn"
                  onClick={() => navigate("/app")}
                >
                  <ArrowLeft size={15} strokeWidth={2} aria-hidden />
                  <span>Volver a {sessionLabel}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="sede-picker__ghost-btn sede-picker__ghost-btn--logout"
                onClick={logout}
              >
                <LogOut size={15} strokeWidth={2} aria-hidden />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          <h1 className="sede-picker__title">
            Hola, <span className="auth-hero__title-accent">{user?.fullName ?? "Usuario"}</span>. ¿Con qué sede deseas ingresar?
          </h1>
          <p className="sede-picker__sub">
            {canViewAllWarehouses
              ? "Ingresa a la Sede Administrativa para cambiar permisos, gestionar usuarios, sedes o ver el consolidado general de la empresa, o elige una sede operativa para trabajar directamente en ella."
              : "Selecciona una de tus sedes asignadas para iniciar tu operación sin tener que elegir sede en cada pantalla."}
          </p>
        </header>

        {loading ? (
          <div className="sede-picker__state" role="status">
            <Loader2 size={24} strokeWidth={2.25} className="auth-submit__spinner" aria-hidden />
            <span>Cargando sedes disponibles…</span>
          </div>
        ) : error ? (
          <div className="sede-picker__state sede-picker__state--error" role="alert">
            <p>No se pudieron cargar las sedes: {error}</p>
            <button type="button" className="btn primary" onClick={() => void reload()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="sede-picker__body">
            {canViewAllWarehouses ? (
              <section className="sede-picker__section" aria-label="Sede administrativa">
                <h2 className="sede-picker__section-title">
                  <ShieldCheck size={16} strokeWidth={2} aria-hidden />
                  <span>Administración corporativa</span>
                </h2>
                <button
                  type="button"
                  className={`sede-card sede-card--admin${isAllWarehouses ? " is-active" : ""}`}
                  onClick={handleSelectAdminHeadquarters}
                >
                  <div className="sede-card__icon sede-card__icon--admin" aria-hidden>
                    <Building2 size={24} strokeWidth={1.85} />
                  </div>
                  <div className="sede-card__content">
                    <div className="sede-card__title-row">
                      <strong className="sede-card__name">Sede Administrativa</strong>
                      <span className="sede-card__badge sede-card__badge--admin">
                        Gestión general · Empresa
                      </span>
                      {isAllWarehouses ? (
                        <span className="sede-card__current">
                          <Check size={13} strokeWidth={2.5} aria-hidden />
                          Sesión actual
                        </span>
                      ) : null}
                    </div>
                    <p className="sede-card__desc">
                      Permisos y usuarios, creación de sedes, catálogo general de productos, inventario inicial por sedes, utilidades y movimientos consolidados de toda la empresa.
                    </p>
                  </div>
                  <div className="sede-card__arrow" aria-hidden>
                    <ArrowRight size={20} strokeWidth={2} />
                  </div>
                </button>
              </section>
            ) : null}

            <section className="sede-picker__section" aria-label="Sedes operativas">
              <h2 className="sede-picker__section-title">
                <Store size={16} strokeWidth={2} aria-hidden />
                <span>{canViewAllWarehouses ? "Sedes operativas" : "Tus sedes asignadas"}</span>
              </h2>

              {assignedWarehouses.length === 0 ? (
                <div className="sede-picker__empty">
                  <p>
                    {canViewAllWarehouses
                      ? "Aún no hay sedes operativas activas. Ingresa a la Sede Administrativa para crear la primera sede."
                      : "Tu usuario no tiene sedes activas asignadas en este momento. Solicita al administrador que te asigne una sede."}
                  </p>
                </div>
              ) : (
                <div className="sede-picker__grid">
                  {assignedWarehouses.map((w) => {
                    const isFactory = w.is_factory === true;
                    const isCurrent = !isAllWarehouses && warehouseId === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        className={`sede-card${isFactory ? " sede-card--factory" : ""}${
                          isCurrent ? " is-active" : ""
                        }`}
                        onClick={() => handleSelectWarehouse(w.id)}
                      >
                        <div
                          className={`sede-card__icon${
                            isFactory ? " sede-card__icon--factory" : " sede-card__icon--store"
                          }`}
                          aria-hidden
                        >
                          {isFactory ? (
                            <Factory size={22} strokeWidth={1.85} />
                          ) : (
                            <Store size={22} strokeWidth={1.85} />
                          )}
                        </div>
                        <div className="sede-card__content">
                          <div className="sede-card__title-row">
                            <strong className="sede-card__name">{w.name}</strong>
                            <span
                              className={`sede-card__badge${
                                isFactory ? " sede-card__badge--factory" : " sede-card__badge--store"
                              }`}
                            >
                              {isFactory ? "Fábrica" : "Punto de venta"}
                            </span>
                            {isCurrent ? (
                              <span className="sede-card__current">
                                <Check size={13} strokeWidth={2.5} aria-hidden />
                                Actual
                              </span>
                            ) : null}
                          </div>
                          <p className="sede-card__desc">
                            Código <code>{w.code}</code> ·{" "}
                            {isFactory
                              ? "Órdenes de producción, despachos, entradas y stock de planta"
                              : "Ventas, entradas, salidas, cierre de inventario y stock del local"}
                          </p>
                        </div>
                        <div className="sede-card__arrow" aria-hidden>
                          <ArrowRight size={18} strokeWidth={2} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
