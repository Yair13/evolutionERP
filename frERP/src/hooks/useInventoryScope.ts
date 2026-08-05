import { useWarehouse } from "../context/WarehouseContext.js";

/** Alcance de inventario según la sesión de sede. */
export function useInventoryScope() {
  const {
    warehouses,
    warehouseId,
    isAllWarehouses,
    canViewAllWarehouses,
    sessionLabel,
    setWarehouseId,
  } = useWarehouse();

  return {
    canViewAllWarehouses,
    warehouses,
    defaultWarehouseId: warehouseId,
    isAllWarehouses,
    sessionLabel,
    setWarehouseId,
    /** null = todas (solo si el usuario puede). */
    effectiveWarehouseId: isAllWarehouses ? null : warehouseId,
    scopeLabel: (filterWarehouseId?: string | null) => {
      if (filterWarehouseId === "" || filterWarehouseId == null) {
        if (canViewAllWarehouses && (isAllWarehouses || filterWarehouseId === "")) {
          return "Todas las sedes";
        }
      }
      const id = filterWarehouseId || warehouseId;
      const name = warehouses.find((w) => w.id === id)?.name;
      return name ?? sessionLabel;
    },
  };
}
