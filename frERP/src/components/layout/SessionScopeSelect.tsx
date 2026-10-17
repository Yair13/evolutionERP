import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Building2, Factory, Store } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext.js";

/**
 * Muestra la sede activa de la sesión en el topbar y un botón "Cambiar sede"
 * que regresa a la pantalla intermedia (/seleccionar-sede).
 */
export function SessionScopeSelect() {
  const {
    warehouses,
    warehouseId,
    isAllWarehouses,
    canViewAllWarehouses,
    loading,
    error,
    sessionLabel,
  } = useWarehouse();
  const navigate = useNavigate();

  if (loading) {
    return <span className="topbar-wh topbar-wh--muted">Sede…</span>;
  }
  if (error) {
    return (
      <span className="topbar-wh topbar-wh--error" title={error}>
        Error sedes
      </span>
    );
  }
  if (!isAllWarehouses && warehouses.length === 0) {
    return <span className="topbar-wh topbar-wh--error">Sin sede</span>;
  }

  const selected = warehouses.find((w) => w.id === warehouseId) ?? null;
  const singleAssigned = !canViewAllWarehouses && warehouses.length === 1;
  const selectedIsFactory = selected?.is_factory === true;

  if (singleAssigned) {
    return (
      <div
        className={`topbar-wh topbar-wh--static${selectedIsFactory ? " topbar-wh--factory" : ""}`}
        title="Sede asignada a tu usuario"
      >
        {selectedIsFactory ? (
          <Factory size={15} strokeWidth={2} aria-hidden />
        ) : (
          <Store size={15} strokeWidth={2} aria-hidden />
        )}
        <span className="topbar-wh__meta">
          <span className="topbar-wh__name">{selected?.name ?? sessionLabel}</span>
          <span className="topbar-wh__badge">
            {selectedIsFactory ? "Fábrica" : "Punto de venta"}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`topbar-wh${selectedIsFactory ? " topbar-wh--factory" : ""}${
        isAllWarehouses ? " topbar-wh--all" : ""
      }`}
    >
      <button
        type="button"
        className="topbar-wh__trigger"
        title="Cambiar de sede"
        aria-label="Cambiar de sede"
        onClick={() => navigate("/seleccionar-sede")}
      >
        <span className="topbar-wh__lead" aria-hidden>
          {isAllWarehouses ? (
            <Building2 size={15} strokeWidth={2} />
          ) : selectedIsFactory ? (
            <Factory size={15} strokeWidth={2} />
          ) : (
            <Store size={15} strokeWidth={2} />
          )}
        </span>
        <span className="topbar-wh__meta">
          <span className="topbar-wh__name">
            {isAllWarehouses ? "Sede Administrativa" : selected?.name ?? sessionLabel}
          </span>
          <span className="topbar-wh__badge">
            {isAllWarehouses
              ? "Gestión general"
              : selectedIsFactory
                ? "Fábrica"
                : "Punto de venta"}
          </span>
        </span>
        <span className="topbar-wh__switch">
          <ArrowLeftRight size={13} strokeWidth={2.2} aria-hidden />
          <span className="topbar-wh__switch-text">Cambiar sede</span>
        </span>
      </button>
    </div>
  );
}
