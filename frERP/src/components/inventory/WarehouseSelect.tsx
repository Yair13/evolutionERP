import { Building2 } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext.js";

type WarehouseSelectProps = {
  /** Etiqueta del selector (existencias por sede, no el producto en sí). */
  label?: string;
};

export function WarehouseSelect({ label = "Existencias en" }: WarehouseSelectProps) {
  const { warehouses, warehouseId, setWarehouseId, isAllWarehouses, sessionLabel, loading, error } = useWarehouse();

  if (loading) {
    return <span className="inv-wh-select inv-wh-select--loading">Cargando sedes…</span>;
  }
  if (error) {
    return <span className="inv-wh-select inv-wh-select--error">{error}</span>;
  }
  if (warehouses.length === 0) {
    return <span className="inv-wh-select inv-wh-select--error">Sin sede asignada</span>;
  }

  if (!isAllWarehouses) {
    return (
      <div className="inv-wh-select inv-wh-select--locked">
        <Building2 size={16} strokeWidth={2} aria-hidden />
        <span className="inv-wh-select__label">{label}:</span>
        <strong style={{ marginLeft: 6 }}>{sessionLabel}</strong>
      </div>
    );
  }

  return (
    <label className="inv-wh-select">
      <Building2 size={16} strokeWidth={2} aria-hidden />
      <span className="inv-wh-select__label">{label}</span>
      <select
        value={warehouseId ?? ""}
        onChange={(e) => setWarehouseId(e.target.value)}
        aria-label="Seleccionar sede"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
