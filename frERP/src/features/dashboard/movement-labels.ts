const labels: Record<string, string> = {
  entry_factory: "Entrada fábrica",
  sale: "Venta",
  exchange: "Cambio",
  warranty: "Garantía",
  return_in: "Devolución",
  payment: "Abono",
  credit: "Crédito",
  transfer_out: "Traslado salida",
  transfer_in: "Traslado entrada",
  adjustment: "Ajuste",
  inventory_close: "Cierre inventario",
};

export function movementTypeLabel(code: string): string {
  return labels[code] ?? code;
}
