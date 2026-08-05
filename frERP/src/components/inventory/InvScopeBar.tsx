import { Building2, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { useWarehouse } from "../../context/WarehouseContext.js";

type InvScopeBarProps = {
  /** Resalta el ámbito principal de la pantalla. */
  focus?: "catalog" | "stock";
  /** Sede controlada localmente (p. ej. alta de producto). Si no se pasa, usa contexto global. */
  warehouseId?: string | null;
  onWarehouseChange?: (id: string | null) => void;
  /** Permite “sin sede” al crear producto. */
  allowEmptyWarehouse?: boolean;
  emptyLabel?: string;
  /** Texto bajo el bloque de sede. */
  stockHint?: ReactNode;
  /**
   * Si true (y no es admin), muestra la sede sin selector.
   * La sede de sesión se cambia en el topbar.
   */
  lockWarehouse?: boolean;
  /** Incluye "Todas" cuando hay selector local (poco usado; la sesión vive en el topbar). */
  allowAllWarehouses?: boolean;
  /** Exige sede concreta (entrada/salida): muestra selector si estás en "Todas". */
  requireSingleWarehouse?: boolean;
};

export function InvScopeBar({
  focus = "catalog",
  warehouseId: controlledId,
  onWarehouseChange,
  allowEmptyWarehouse = false,
  emptyLabel = "Sin sede aún",
  stockHint,
  lockWarehouse = false,
  allowAllWarehouses = false,
  requireSingleWarehouse = false,
}: InvScopeBarProps) {
  const {
    warehouses,
    warehouseId: ctxId,
    isAllWarehouses,
    canViewAllWarehouses,
    setWarehouseId,
    loading,
    error,
    sessionLabel,
  } = useWarehouse();
  const isControlled = onWarehouseChange != null;
  const showAll = allowAllWarehouses && canViewAllWarehouses;
  const value = isControlled
    ? controlledId == null
      ? ""
      : controlledId
    : isAllWarehouses
      ? ""
      : (ctxId ?? "");
  const selected = warehouses.find((w) => w.id === value);
  const needsSede = requireSingleWarehouse && (isControlled ? !controlledId : isAllWarehouses);
  // Selector local solo si: controlado, alta sin sede, o hay que salir de "Todas" para operar
  const showLocalSelect =
    isControlled || allowEmptyWarehouse || (requireSingleWarehouse && (needsSede || canViewAllWarehouses));

  function onSelect(id: string) {
    const next = id === "" ? null : id;
    if (isControlled) {
      onWarehouseChange(next);
    } else {
      setWarehouseId(next);
    }
  }

  return (
    <div className="inv-scope" role="group" aria-label="Ámbito catálogo y existencias">
      <div
        className={`inv-scope__block inv-scope__block--catalog${focus === "catalog" ? " is-active" : ""}`}
      >
        <Layers size={18} strokeWidth={2} aria-hidden />
        <div className="inv-scope__text">
          <span className="inv-scope__title">Catálogo</span>
          <span className="inv-scope__sub">Toda la empresa</span>
        </div>
      </div>

      <div className="inv-scope__sep" aria-hidden />

      <div
        className={`inv-scope__block inv-scope__block--stock${focus === "stock" ? " is-active" : ""}`}
      >
        {loading ? (
          <span className="inv-wh-select inv-wh-select--loading">Cargando sedes…</span>
        ) : error ? (
          <span className="inv-wh-select inv-wh-select--error">{error}</span>
        ) : warehouses.length === 0 ? (
          <span className="inv-wh-select inv-wh-select--error">Sin sede asignada</span>
        ) : showLocalSelect ? (
          <label className="inv-wh-select inv-wh-select--scope">
            <Building2 size={16} strokeWidth={2} aria-hidden />
            <span className="inv-scope__text">
              <span className="inv-scope__title">
                {requireSingleWarehouse ? "Operar en sede" : "Sede"}
              </span>
              <span className="inv-scope__sub">
                {requireSingleWarehouse ? "Requerida para movimientos" : "Ámbito"}
              </span>
            </span>
            <select
              value={value}
              onChange={(e) => onSelect(e.target.value)}
              aria-label="Sede"
            >
              {showAll && !requireSingleWarehouse ? (
                <option value="">Todas las sedes</option>
              ) : null}
              {requireSingleWarehouse ? (
                <option value="">— Elige una sede —</option>
              ) : null}
              {allowEmptyWarehouse ? <option value="">{emptyLabel}</option> : null}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.is_factory ? " · Fábrica" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="inv-wh-select inv-wh-select--scope inv-wh-select--locked">
            <Building2 size={16} strokeWidth={2} aria-hidden />
            <span className="inv-scope__text">
              <span className="inv-scope__title">Sesión</span>
              <span className="inv-scope__sub">{sessionLabel}</span>
            </span>
          </div>
        )}
        {stockHint ? <p className="inv-scope__hint">{stockHint}</p> : null}
        {needsSede ? (
          <p className="inv-scope__hint" style={{ color: "#b45309" }}>
            Estás en “Todas las sedes”. Elige una sede concreta para operar.
          </p>
        ) : null}
        {!showLocalSelect && !lockWarehouse ? (
          <p className="inv-scope__hint">Cámbiala en el selector del encabezado.</p>
        ) : null}
        {!needsSede && selected && requireSingleWarehouse ? (
          <p className="inv-scope__hint">
            Operando en {selected.name}
            {selected.is_factory ? " (fábrica)" : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
