import type { ExitKind } from "./inventory.types.js";

export const EXIT_KIND_OPTIONS: { value: ExitKind; label: string; description: string }[] = [
  {
    value: "sale",
    label: "Venta",
    description: "Salida por venta al cliente. Requiere datos del cliente y método de pago.",
  },
  {
    value: "exchange",
    label: "Cambio",
    description:
      "Cambio de producto. Indica la factura original, marca el retorno en el carrito y deja un valor neto distinto de $0.",
  },
  {
    value: "credit",
    label: "Crédito",
    description: "Salida a crédito. Puedes indicar el cliente.",
  },
  {
    value: "warranty",
    label: "Garantía",
    description: "Reemplazo en garantía. Indica la factura de la venta original.",
  },
  {
    value: "return",
    label: "Devolución",
    description: "El cliente devuelve producto: el stock vuelve al almacén.",
  },
  {
    value: "transfer",
    label: "Traslado",
    description: "Traslado entre sedes. Resta stock y requiere sede de destino.",
  },
  {
    value: "distribution",
    label: "Distribución",
    description: "Distribución desde fábrica hacia las sedes. Requiere sede de destino.",
  },
  {
    value: "return_to_factory",
    label: "Devolución a Fábrica",
    description: "Retorno de mercadería desde el almacén hacia la fábrica.",
  },
];

export function exitKindLabel(kind: ExitKind | null | undefined): string {
  return EXIT_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? "Salida";
}
