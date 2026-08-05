import { useEffect, useId, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Factory, Globe2, Store } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext.js";

/**
 * Selector de sede de sesión (va dentro del chip del topbar).
 */
export function SessionScopeSelect() {
  const {
    warehouses,
    warehouseId,
    isAllWarehouses,
    canViewAllWarehouses,
    setWarehouseId,
    loading,
    error,
    sessionLabel,
  } = useWarehouse();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) {
    return <span className="topbar-wh topbar-wh--muted">Sedes…</span>;
  }
  if (error) {
    return (
      <span className="topbar-wh topbar-wh--error" title={error}>
        Error sedes
      </span>
    );
  }
  if (warehouses.length === 0) {
    return <span className="topbar-wh topbar-wh--error">Sin sede</span>;
  }

  const selected = warehouses.find((w) => w.id === warehouseId) ?? null;
  const singleAssigned = !canViewAllWarehouses && warehouses.length === 1;
  const selectedIsFactory = selected?.is_factory === true;

  if (singleAssigned) {
    return (
      <div
        className={`topbar-wh topbar-wh--static${selectedIsFactory ? " topbar-wh--factory" : ""}`}
        title="Sede de tu usuario"
      >
        {selectedIsFactory ? (
          <Factory size={15} strokeWidth={2} aria-hidden />
        ) : (
          <Store size={15} strokeWidth={2} aria-hidden />
        )}
        <span className="topbar-wh__meta">
          <span className="topbar-wh__name">{selected?.name ?? sessionLabel}</span>
          {selectedIsFactory ? <span className="topbar-wh__badge">Fábrica</span> : null}
        </span>
      </div>
    );
  }

  function choose(id: string | null) {
    setWarehouseId(id);
    setOpen(false);
  }

  return (
    <div
      className={`topbar-wh topbar-wh--menu${open ? " is-open" : ""}${
        selectedIsFactory ? " topbar-wh--factory" : ""
      }${isAllWarehouses ? " topbar-wh--all" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="topbar-wh__trigger"
        aria-label="Sede de sesión"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="topbar-wh__lead" aria-hidden>
          {isAllWarehouses ? (
            <Globe2 size={15} strokeWidth={2} />
          ) : selectedIsFactory ? (
            <Factory size={15} strokeWidth={2} />
          ) : (
            <Store size={15} strokeWidth={2} />
          )}
        </span>
        <span className="topbar-wh__meta">
          <span className="topbar-wh__name">
            {isAllWarehouses ? "Todas las sedes" : selected?.name ?? "Elegir sede"}
          </span>
          {selectedIsFactory ? <span className="topbar-wh__badge">Fábrica</span> : null}
          {!isAllWarehouses && selected && !selectedIsFactory ? (
            <span className="topbar-wh__badge topbar-wh__badge--muted">Punto de venta</span>
          ) : null}
        </span>
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden className="topbar-wh__chevron" />
      </button>

      {open ? (
        <div className="topbar-wh-menu" role="listbox" id={listId} aria-label="Sedes disponibles">
          <div className="topbar-wh-menu__head">
            <Building2 size={14} strokeWidth={2} aria-hidden />
            <span>Cambiar sede</span>
          </div>
          <ul className="topbar-wh-menu__list">
            {canViewAllWarehouses ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={isAllWarehouses}
                  className={`topbar-wh-option${isAllWarehouses ? " is-selected" : ""}`}
                  onClick={() => choose(null)}
                >
                  <span className="topbar-wh-option__icon topbar-wh-option__icon--all" aria-hidden>
                    <Globe2 size={16} strokeWidth={2} />
                  </span>
                  <span className="topbar-wh-option__text">
                    <strong>Todas las sedes</strong>
                    <span>Vista global de la empresa</span>
                  </span>
                  {isAllWarehouses ? (
                    <Check size={16} strokeWidth={2.5} className="topbar-wh-option__check" aria-hidden />
                  ) : null}
                </button>
              </li>
            ) : null}

            {warehouses.map((w) => {
              const isFactory = w.is_factory === true;
              const active = !isAllWarehouses && w.id === warehouseId;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`topbar-wh-option${active ? " is-selected" : ""}${
                      isFactory ? " topbar-wh-option--factory" : ""
                    }`}
                    onClick={() => choose(w.id)}
                  >
                    <span
                      className={`topbar-wh-option__icon${
                        isFactory ? " topbar-wh-option__icon--factory" : " topbar-wh-option__icon--store"
                      }`}
                      aria-hidden
                    >
                      {isFactory ? (
                        <Factory size={16} strokeWidth={2} />
                      ) : (
                        <Store size={16} strokeWidth={2} />
                      )}
                    </span>
                    <span className="topbar-wh-option__text">
                      <strong>{w.name}</strong>
                      <span>
                        {w.code}
                        {isFactory ? " · Fábrica" : " · Punto de venta"}
                      </span>
                    </span>
                    {active ? (
                      <Check size={16} strokeWidth={2.5} className="topbar-wh-option__check" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
