import { exitKindLabel } from "./exit-labels.js";
import type { ExitKind } from "./inventory.types.js";

export function documentTypeLabel(doc: {
  docType: string;
  exitKind?: ExitKind | null;
  productionOrderCode?: string | null;
  entryType?: string | null;
  reason?: string | null;
  metadata?: { entryType?: string | null; countKind?: string | null } | null;
}): string {
  if (doc.docType === "adjustment") {
    return "Ajuste de inventario";
  }
  if (doc.docType === "entry") {
    const et = doc.entryType ?? doc.metadata?.entryType;
    if (doc.productionOrderCode || et === "production_order") {
      return "Orden de producción";
    }
    if (et === "transfer") return "Entrada · Traslado";
    if (et === "distribution") return "Entrada";
    if (et === "return_to_factory") return "Entrada · Devolución a fábrica";
    return "Entrada";
  }
  if (doc.exitKind) return exitKindLabel(doc.exitKind);
  if (doc.docType === "warranty") return "Garantía";
  if (doc.docType === "return") return "Devolución";
  return "Salida";
}

export function isOutboundDocument(docType: string): boolean {
  return docType === "exit" || docType === "warranty" || docType === "return";
}
