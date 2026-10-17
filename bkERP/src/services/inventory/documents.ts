import type pg from "pg";
import { canSeeProductionCost } from "../../lib/inventory-permissions.js";
import type { AuthContext } from "../auth-context.js";
import { listDocumentEvents, type DocumentStatusEventView } from "./document-events.js";
import {
  canManageMovementEditing,
  MOVEMENT_EDIT_TZ,
} from "./movement-edit-settings.js";

export type DocType = "entry" | "exit";
export type ExitKind = "sale" | "return" | "credit" | "warranty" | "distribution" | "transfer" | "return_to_factory" | "exchange";

export type ConfirmExitInput = {
  exitKind: ExitKind;
  lines: ConfirmLineInput[];
  notes?: string | null;
  customerName?: string | null;
  relatedInvoiceNumber?: string | null;
  createProductionOrder?: boolean;
  customerId?: string | null;
  paymentMethod?: string | null;
  paymentBreakdown?: { method: string; amount: number }[] | null;
  destinationWarehouseId?: string | null;
};

export type ConfirmLineInput = {
  productId: string;
  quantity: number;
  unitSalePrice?: number;
  isReturn?: boolean;
};

function resolveUnitSalePrice(requested: number | undefined, suggested: number): number {
  const min = Math.round(Number(suggested) || 0);
  if (requested == null || !Number.isFinite(requested)) {
    return min;
  }
  const price = Math.round(Number(requested));
  if (price < min) {
    throw Object.assign(new Error("sale_price_below_suggested"), {
      code: "sale_price_below_suggested",
      suggested: min,
      requested: price,
    });
  }
  return price;
}

export type InventoryDocumentSummary = {
  id: string;
  warehouseId?: string;
  docType: DocType | "warranty" | "return" | "adjustment";
  status: string;
  notes: string | null;
  reason?: string | null;
  lineCount: number;
  totalQuantity: number;
  createdAt: string;
  completedAt: string | null;
  createdByName: string | null;
  invoiceNumber?: string | null;
  exitKind?: ExitKind | null;
  customerName?: string | null;
  relatedInvoiceNumber?: string | null;
  warehouseName?: string | null;
  warehouseCode?: string | null;
  totalAmount?: number;
  lastEditObservation?: string | null;
  lastUnlockObservation?: string | null;
  editCount?: number;
  editingUnlocked?: boolean;
  productionOrderCode?: string | null;
  entryType?: string | null;
  labelsPrintedAt?: string | null;
  customerTaxId?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  metadata?: any;
};

export type DocumentLineView = {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  barcode?: string | null;
  imageUrl: string | null;
  quantity: number;
  unitSalePrice: number | null;
  unitCost: number | null;
};

export type InventoryDocumentDetail = InventoryDocumentSummary & {
  lines: DocumentLineView[];
  events?: DocumentStatusEventView[];
};

export type UnlockDocumentEditingInput = {
  observation: string;
};

export type MovementKind = "entry" | ExitKind;

export type EditCompletedDocumentInput = {
  movementKind: MovementKind;
  lines: ConfirmLineInput[];
  notes?: string | null;
  customerName?: string | null;
  relatedInvoiceNumber?: string | null;
};

function parseMovementKind(kind: MovementKind): {
  docType: InventoryDocumentSummary["docType"];
  exitKind: ExitKind | null;
  isEntry: boolean;
} {
  if (kind === "entry") {
    return { docType: "entry", exitKind: null, isEntry: true };
  }
  return { docType: docTypeForExitKind(kind), exitKind: kind, isEntry: false };
}

function mergeEditLines(lines: ConfirmLineInput[]): ConfirmLineInput[] {
  const map = new Map<string, number>();
  for (const line of lines) {
    const qty = Number(line.quantity);
    if (!line.productId || !Number.isFinite(qty) || qty <= 0) continue;
    map.set(line.productId, (map.get(line.productId) ?? 0) + qty);
  }
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function warehouseScopeSql(
  auth: AuthContext,
  warehouseId: string | null | undefined,
  alias: string,
  params: unknown[]
): string {
  if (warehouseId) {
    params.push(warehouseId);
    return `${alias}.warehouse_id = $${params.length}::uuid`;
  }
  if (auth.warehouseIds === null || auth.hasAdminAccess) {
    return "TRUE";
  }
  if (auth.warehouseIds.length === 0) {
    return "FALSE";
  }
  params.push(auth.warehouseIds);
  return `${alias}.warehouse_id = ANY($${params.length}::uuid[])`;
}

function movementTypeFor(docType: DocType): string {
  return docType === "entry" ? "entry_factory" : "sale";
}

function signedQuantity(docType: DocType, qty: number): number {
  const n = Math.abs(qty);
  return docType === "entry" ? n : -n;
}

function docTypeForExitKind(kind: ExitKind): InventoryDocumentSummary["docType"] {
  if (kind === "warranty") return "warranty";
  if (kind === "return") return "return";
  return "exit";
}

function movementTypeForExitKind(kind: ExitKind): string {
  switch (kind) {
    case "sale":
      return "sale";
    case "credit":
      return "credit";
    case "warranty":
      return "warranty";
    case "return":
      return "return_in";
    case "distribution":
      return "transfer_out";
    case "transfer":
      return "transfer_out";
    case "return_to_factory":
      return "transfer_out";
    case "exchange":
      return "exchange";
  }
}

/** Devolución ingresa stock; el resto de salidas lo reduce. */
function signedQuantityForExit(kind: ExitKind, qty: number): number {
  const n = Math.abs(qty);
  return kind === "return" ? n : -n;
}

function exitKindLabel(kind: ExitKind): string {
  switch (kind) {
    case "sale":
      return "Venta";
    case "credit":
      return "Crédito";
    case "warranty":
      return "Garantía";
    case "return":
      return "Devolución";
    case "distribution":
      return "Distribución";
    case "transfer":
      return "Traslado";
    case "return_to_factory":
      return "Devolución a Fábrica";
    case "exchange":
      return "Cambio";
  }
}

/** Normaliza códigos cortos: mayúsculas, sin espacios. Ej. "lc40 - 15" → "LC40-15" */
export function normalizeInvoiceCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/–|—/g, "-");
}

function warehouseCodePrefix(code: string | null | undefined): string {
  return (code ?? "S").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "S";
}

/**
 * Código corto usable en tablet: SEDE-consecutivo (ej. LC40-15).
 * Sin fecha: menos caracteres, más fácil de digitar al recibir en destino.
 */
async function nextInvoiceNumber(
  client: pg.PoolClient,
  warehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  const prefix = warehouseCodePrefix(wh[0]?.code);
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM inventory_documents
    WHERE warehouse_id = $1::uuid AND invoice_number IS NOT NULL
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `${prefix}-${num}`;
}

async function nextProductionOrderCode(
  client: pg.PoolClient,
  warehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  const prefix = (wh[0]?.code ?? "S").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "S";
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM production_orders
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `OP-${prefix}-${ymd}-${String(num).padStart(4, "0")}`;
}

async function resolveCustomerId(
  client: pg.PoolClient,
  name: string | null | undefined
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id::text FROM customers WHERE lower(trim(display_name)) = lower(trim($1)) LIMIT 1`,
    [trimmed]
  );
  if (existing[0]) return existing[0].id;
  const { rows: created } = await client.query<{ id: string }>(
    `INSERT INTO customers (display_name) VALUES ($1) RETURNING id::text`,
    [trimmed]
  );
  return created[0]?.id ?? null;
}

export type LinkedEntryType = "distribution" | "transfer" | "return_to_factory";

const ENTRY_EXIT_KIND_MAP: Record<LinkedEntryType, ExitKind> = {
  distribution: "distribution",
  transfer: "transfer",
  return_to_factory: "return_to_factory",
};

export type OriginExitLookup = {
  documentId: string;
  warehouseId: string;
  invoiceNumber: string;
  exitKind: ExitKind;
  destinationWarehouseId: string | null;
  alreadyReceived: boolean;
};

function isLinkedEntryType(value: string | null | undefined): value is LinkedEntryType {
  return value === "distribution" || value === "transfer" || value === "return_to_factory";
}

/** Valida factura de salida para entradas de distribución / traslado / devolución a fábrica.
 * Reglas: solo sede destino, un solo uso, búsqueda tolerante a mayúsculas/espacios. */
export async function lookupOriginExitForEntry(
  pool: pg.Pool,
  opts: {
    invoiceNumber: string;
    entryType: LinkedEntryType;
    receivingWarehouseId: string;
  }
): Promise<OriginExitLookup> {
  const invoiceNumber = normalizeInvoiceCode(opts.invoiceNumber);
  if (!invoiceNumber) {
    throw Object.assign(new Error("origin_invoice_required"), { code: "origin_invoice_required" });
  }

  const expectedKind = ENTRY_EXIT_KIND_MAP[opts.entryType];
  const { rows } = await pool.query<{
    id: string;
    warehouse_id: string;
    invoice_number: string;
    exit_kind: ExitKind | null;
    destination_warehouse_id: string | null;
    status: string;
  }>(
    `
    SELECT
      d.id::text,
      d.warehouse_id::text,
      d.invoice_number,
      d.exit_kind,
      d.metadata->>'destinationWarehouseId' AS destination_warehouse_id,
      d.status
    FROM inventory_documents d
    WHERE upper(replace(d.invoice_number, ' ', '')) = $1
      AND d.doc_type IN ('exit', 'warranty', 'return')
    ORDER BY d.completed_at DESC NULLS LAST
    LIMIT 1
    `,
    [invoiceNumber]
  );

  const doc = rows[0];
  if (!doc || doc.status === "cancelled") {
    throw Object.assign(new Error("origin_invoice_not_found"), { code: "origin_invoice_not_found" });
  }
  if (doc.exit_kind !== expectedKind) {
    throw Object.assign(new Error("origin_invoice_wrong_type"), {
      code: "origin_invoice_wrong_type",
      expected: expectedKind,
      actual: doc.exit_kind,
    });
  }
  if (!doc.destination_warehouse_id) {
    throw Object.assign(new Error("origin_invoice_missing_destination"), {
      code: "origin_invoice_missing_destination",
    });
  }
  if (doc.destination_warehouse_id !== opts.receivingWarehouseId) {
    throw Object.assign(new Error("origin_invoice_wrong_destination"), {
      code: "origin_invoice_wrong_destination",
    });
  }

  const canonical = normalizeInvoiceCode(doc.invoice_number);
  const { rows: recv } = await pool.query<{ id: string }>(
    `
    SELECT id::text
    FROM inventory_documents
    WHERE doc_type = 'entry'
      AND status = 'completed'
      AND upper(replace(COALESCE(metadata->>'originInvoiceNumber', ''), ' ', '')) = $1
    LIMIT 1
    `,
    [canonical]
  );

  return {
    documentId: doc.id,
    warehouseId: doc.warehouse_id,
    invoiceNumber: doc.invoice_number,
    exitKind: doc.exit_kind!,
    destinationWarehouseId: doc.destination_warehouse_id,
    alreadyReceived: recv.length > 0,
  };
}

export async function confirmDocument(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string,
  docType: DocType,
  lines: ConfirmLineInput[],
  notes?: string | null,
  entryType?: string | null,
  originInvoiceNumber?: string | null
): Promise<InventoryDocumentDetail> {
  const cleaned = lines
    .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }))
    .filter((l) => l.quantity > 0);

  if (cleaned.length === 0) {
    throw Object.assign(new Error("lines_required"), { code: "lines_required" });
  }

  const isProductionOrder = docType === "entry" && entryType === "production_order";

  let originLink: OriginExitLookup | null = null;
  if (docType === "entry" && isLinkedEntryType(entryType)) {
    if (!originInvoiceNumber?.trim()) {
      throw Object.assign(new Error("origin_invoice_required"), { code: "origin_invoice_required" });
    }
    originLink = await lookupOriginExitForEntry(pool, {
      invoiceNumber: originInvoiceNumber,
      entryType,
      receivingWarehouseId: warehouseId,
    });
    if (originLink.alreadyReceived) {
      throw Object.assign(new Error("origin_invoice_already_received"), {
        code: "origin_invoice_already_received",
      });
    }

    const { rows: originLines } = await pool.query<{
      product_id: string;
      quantity: string;
    }>(
      `
      SELECT product_id::text, ABS(quantity)::text AS quantity
      FROM inventory_document_lines
      WHERE document_id = $1::uuid
      `,
      [originLink.documentId]
    );
    const originByProduct = new Map(
      originLines.map((l) => [l.product_id, Number(l.quantity)])
    );
    for (const line of cleaned) {
      const allowed = originByProduct.get(line.productId);
      if (allowed == null) {
        throw Object.assign(new Error("entry_line_not_in_origin"), {
          code: "entry_line_not_in_origin",
        });
      }
      if (line.quantity > allowed) {
        throw Object.assign(new Error("entry_qty_exceeds_origin"), {
          code: "entry_qty_exceeds_origin",
          requested: line.quantity,
          available: allowed,
        });
      }
    }
    if (cleaned.length !== originByProduct.size) {
      // Must receive exactly the same products as the origin exit (full receipt)
      const cleanedIds = new Set(cleaned.map((l) => l.productId));
      for (const productId of originByProduct.keys()) {
        if (!cleanedIds.has(productId)) {
          throw Object.assign(new Error("entry_missing_origin_lines"), {
            code: "entry_missing_origin_lines",
          });
        }
      }
    }
  }

  const includeCost = canSeeProductionCost(auth);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: whRows } = await client.query<{ is_factory: boolean }>(
      `SELECT COALESCE(is_factory, false) AS is_factory FROM warehouses WHERE id = $1::uuid`,
      [warehouseId]
    );
    const isFactoryWarehouse = whRows[0]?.is_factory === true;

    if (isProductionOrder && !isFactoryWarehouse) {
      throw Object.assign(new Error("production_order_requires_factory"), {
        code: "production_order_requires_factory",
      });
    }

    let productionOrderId: string | null = null;
    let productionOrderCode: string | null = null;
    let invoiceNumber: string | null = null;

    if (isProductionOrder) {
      productionOrderCode = await nextProductionOrderCode(client, warehouseId);
      invoiceNumber = productionOrderCode;
      const { rows: poRows } = await client.query<{ id: string }>(
        `INSERT INTO production_orders (order_code, warehouse_id, status, notes, created_by)
         VALUES ($1, $2::uuid, 'open', $3, $4::uuid)
         RETURNING id::text`,
        [productionOrderCode, warehouseId, notes?.trim() || null, auth.userId]
      );
      productionOrderId = poRows[0]!.id;
    }

    const metadata = {
      entryType: entryType || "transfer",
      originInvoiceNumber: originLink
        ? normalizeInvoiceCode(originLink.invoiceNumber)
        : originInvoiceNumber
          ? normalizeInvoiceCode(originInvoiceNumber)
          : null,
      originDocumentId: originLink?.documentId ?? null,
      productionOrderCode,
      productionOrderId,
    };

    const reason = isProductionOrder
      ? `Orden de producción ${productionOrderCode}`
      : docType === "entry"
        ? "Ingreso de mercancía"
        : "Egreso de mercancía";

    const { rows: docRows } = await client.query<{ id: string }>(
      `
      INSERT INTO inventory_documents (
        warehouse_id, doc_type, status, notes, metadata, created_by, completed_at, reason, invoice_number
      )
      VALUES ($1::uuid, $2, 'completed', $3, $4::jsonb, $5::uuid, now(), $6, $7)
      RETURNING id::text
      `,
      [
        warehouseId,
        docType,
        notes?.trim() || null,
        JSON.stringify(metadata),
        auth.userId,
        reason,
        invoiceNumber,
      ]
    );
    const documentId = docRows[0]!.id;

    await client.query(
      `
      INSERT INTO document_status_events (document_id, status, comment, actor_id)
      VALUES ($1::uuid, 'completed', $2, $3::uuid)
      `,
      [
        documentId,
        isProductionOrder
          ? `Orden de producción confirmada · ${productionOrderCode}`
          : docType === "entry"
            ? "Recepción confirmada"
            : "Salida confirmada",
        auth.userId,
      ]
    );

    const movementType = movementTypeFor(docType);

    for (const line of cleaned) {
      const { rows: products } = await client.query<{
        base_sale_price: string;
        production_cost: string;
        name: string;
        reference_code: string;
        barcode: string | null;
        is_active: boolean;
      }>(
        `SELECT base_sale_price::text, production_cost::text, name, reference_code, barcode, is_active
         FROM products WHERE id = $1::uuid`,
        [line.productId]
      );
      const product = products[0];
      if (!product?.is_active) {
        throw Object.assign(new Error("product_not_found"), {
          code: "product_not_found",
          productId: line.productId,
        });
      }

      if (docType === "exit") {
        const { rows: stockRows } = await client.query<{ qty: string }>(
          `
          SELECT COALESCE(SUM(quantity), 0)::text AS qty
          FROM stock_movements
          WHERE warehouse_id = $1::uuid AND product_id = $2::uuid
          `,
          [warehouseId, line.productId]
        );
        const onHand = Number(stockRows[0]?.qty ?? 0);
        if (onHand < line.quantity) {
          throw Object.assign(new Error("insufficient_stock"), {
            code: "insufficient_stock",
            productId: line.productId,
            productName: product.name,
            available: onHand,
            requested: line.quantity,
          });
        }
      }

      const unitSale = Number(product.base_sale_price);
      const unitCost = includeCost ? Number(product.production_cost) : null;

      await client.query(
        `
        INSERT INTO inventory_document_lines (
          document_id, product_id, quantity, unit_cost, unit_sale_price
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
        `,
        [documentId, line.productId, line.quantity, unitCost, unitSale]
      );

      await client.query(
        `
        INSERT INTO stock_movements (
          warehouse_id, product_id, movement_type, quantity, unit_cost, batch_id, created_by, notes, production_order_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8, $9::uuid)
        `,
        [
          warehouseId,
          line.productId,
          movementType,
          signedQuantity(docType, line.quantity),
          unitCost,
          documentId,
          auth.userId,
          notes?.trim() || null,
          productionOrderId,
        ]
      );
    }

    await client.query("COMMIT");

    const detail = await getDocument(pool, auth, documentId, warehouseId);
    if (!detail) throw new Error("document_confirm_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmExitDocument(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string,
  input: ConfirmExitInput
): Promise<InventoryDocumentDetail> {
  const { exitKind, lines, notes, customerName, relatedInvoiceNumber } = input;

  if (exitKind === "sale" && !customerName?.trim() && !input.customerId) {
    throw Object.assign(new Error("customer_name_required"), { code: "customer_name_required" });
  }
  if (exitKind === "warranty" && !relatedInvoiceNumber?.trim()) {
    throw Object.assign(new Error("related_invoice_required"), { code: "related_invoice_required" });
  }
  if (exitKind === "exchange" && !relatedInvoiceNumber?.trim()) {
    throw Object.assign(new Error("related_invoice_required"), { code: "related_invoice_required" });
  }

  const needsDestination =
    exitKind === "transfer" || exitKind === "distribution" || exitKind === "return_to_factory";
  if (needsDestination && !input.destinationWarehouseId) {
    throw Object.assign(new Error("destination_warehouse_required"), {
      code: "destination_warehouse_required",
    });
  }

  const cleaned = lines
    .map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
      unitSalePrice: l.unitSalePrice,
      isReturn: Boolean(l.isReturn),
    }))
    .filter((l) => l.quantity > 0);

  if (cleaned.length === 0) {
    throw Object.assign(new Error("lines_required"), { code: "lines_required" });
  }

  if (exitKind === "sale" && input.paymentBreakdown) {
    const saleTotal = cleaned.reduce(
      (sum, line) => sum + line.quantity * (Number(line.unitSalePrice) || 0),
      0
    );
    const paidTotal = input.paymentBreakdown.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    const invalidPayment = input.paymentBreakdown.some(
      (payment) =>
        !payment.method?.trim() ||
        !Number.isFinite(Number(payment.amount)) ||
        Number(payment.amount) <= 0
    );
    if (invalidPayment || Math.abs(saleTotal - paidTotal) >= 0.01) {
      throw Object.assign(new Error("payment_total_mismatch"), {
        code: "payment_total_mismatch",
      });
    }
  }

  if (exitKind === "exchange") {
    const hasOut = cleaned.some((l) => !l.isReturn);
    const hasIn = cleaned.some((l) => l.isReturn);
    if (!hasOut || !hasIn) {
      throw Object.assign(new Error("exchange_lines_required"), {
        code: "exchange_lines_required",
      });
    }
    const netValue = cleaned.reduce(
      (s, l) => s + (l.isReturn ? -l.quantity : l.quantity) * (Number(l.unitSalePrice) || 0),
      0
    );
    if (netValue === 0) {
      throw Object.assign(new Error("exchange_net_value_required"), {
        code: "exchange_net_value_required",
      });
    }
  }

  const includeCost = canSeeProductionCost(auth);
  const client = await pool.connect();
  const docType = docTypeForExitKind(exitKind);
  const movementType = movementTypeForExitKind(exitKind);

  try {
    await client.query("BEGIN");

    const { rows: whRows } = await client.query<{ is_factory: boolean }>(
      `SELECT COALESCE(is_factory, false) AS is_factory FROM warehouses WHERE id = $1::uuid`,
      [warehouseId]
    );
    const isFactoryWarehouse = whRows[0]?.is_factory === true;

    if (exitKind === "distribution" && !isFactoryWarehouse) {
      throw Object.assign(new Error("distribution_requires_factory"), {
        code: "distribution_requires_factory",
      });
    }

    let destinationWarehouseName: string | null = null;
    let destinationWarehouseCode: string | null = null;
    if (input.destinationWarehouseId) {
      const { rows: destWh } = await client.query<{
        name: string;
        code: string;
        is_factory: boolean;
      }>(
        `SELECT name, code, COALESCE(is_factory, false) AS is_factory
         FROM warehouses WHERE id = $1::uuid AND is_active = true`,
        [input.destinationWarehouseId]
      );
      if (!destWh[0]) {
        throw Object.assign(new Error("destination_warehouse_not_found"), {
          code: "destination_warehouse_not_found",
        });
      }
      if (input.destinationWarehouseId === warehouseId) {
        throw Object.assign(new Error("destination_same_as_origin"), {
          code: "destination_same_as_origin",
        });
      }
      if (exitKind === "return_to_factory" && !destWh[0].is_factory) {
        throw Object.assign(new Error("return_destination_must_be_factory"), {
          code: "return_destination_must_be_factory",
        });
      }
      destinationWarehouseName = destWh[0].name;
      destinationWarehouseCode = destWh[0].code;
    }

    const metadata = {
      exitKind,
      customerName: customerName?.trim() || null,
      relatedInvoiceNumber: relatedInvoiceNumber?.trim() || null,
      exitKindLabel: exitKindLabel(exitKind),
      productionOrderCode: null,
      productionOrderId: null,
      paymentMethod: input.paymentMethod || null,
      paymentBreakdown: exitKind === "sale" ? input.paymentBreakdown || null : null,
      destinationWarehouseId: input.destinationWarehouseId || null,
      destinationWarehouseName,
      destinationWarehouseCode,
    };

    let customerId = input.customerId || null;
    if (!customerId && customerName?.trim()) {
      customerId = await resolveCustomerId(client, customerName);
    }

    const invoiceNumber = await nextInvoiceNumber(client, warehouseId);

    const { rows: docRows } = await client.query<{ id: string }>(
      `
      INSERT INTO inventory_documents (
        warehouse_id, doc_type, status, notes, metadata, created_by, completed_at,
        invoice_number, exit_kind, customer_id, reason
      )
      VALUES ($1::uuid, $2, 'completed', $3, $4::jsonb, $5::uuid, now(), $6, $7, $8::uuid, $9)
      RETURNING id::text
      `,
      [
        warehouseId,
        docType,
        notes?.trim() || null,
        JSON.stringify(metadata),
        auth.userId,
        invoiceNumber,
        exitKind,
        customerId,
        exitKindLabel(exitKind),
      ]
    );
    const documentId = docRows[0]!.id;

    await client.query(
      `
      INSERT INTO document_status_events (document_id, status, comment, actor_id)
      VALUES ($1::uuid, 'completed', $2, $3::uuid)
      `,
      [
        documentId,
        `${exitKindLabel(exitKind)} confirmada · ${invoiceNumber}`,
        auth.userId,
      ]
    );

    for (const line of cleaned) {
      const { rows: products } = await client.query<{
        base_sale_price: string;
        production_cost: string;
        name: string;
        reference_code: string;
        is_active: boolean;
      }>(
        `SELECT base_sale_price::text, production_cost::text, name, reference_code, is_active
         FROM products WHERE id = $1::uuid`,
        [line.productId]
      );
      const product = products[0];
      if (!product?.is_active) {
        throw Object.assign(new Error("product_not_found"), {
          code: "product_not_found",
          productId: line.productId,
        });
      }

      if (exitKind !== "return" && !line.isReturn) {
        const { rows: stockRows } = await client.query<{ qty: string }>(
          `
          SELECT COALESCE(SUM(quantity), 0)::text AS qty
          FROM stock_movements
          WHERE warehouse_id = $1::uuid AND product_id = $2::uuid
          `,
          [warehouseId, line.productId]
        );
        const onHand = Number(stockRows[0]?.qty ?? 0);
        if (onHand < line.quantity) {
          throw Object.assign(new Error("insufficient_stock"), {
            code: "insufficient_stock",
            productId: line.productId,
            productName: product.name,
            available: onHand,
            requested: line.quantity,
          });
        }
      }

      // Salidas internas (traslado/distribución/devolución a fábrica) van a un almacén,
      // no a cliente final: se registran sin valor de venta.
      const unitSale = needsDestination
        ? null
        : resolveUnitSalePrice(line.unitSalePrice, Number(product.base_sale_price));
      const unitCost = includeCost ? Number(product.production_cost) : null;
      const lineQty = line.isReturn ? -line.quantity : line.quantity;

      await client.query(
        `
        INSERT INTO inventory_document_lines (
          document_id, product_id, quantity, unit_cost, unit_sale_price
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
        `,
        [documentId, line.productId, lineQty, unitCost, unitSale]
      );

      let signedQty = -line.quantity;
      let movType = movementType;
      if (exitKind === "return" || line.isReturn) {
        signedQty = line.quantity;
        movType = "return_in";
      }

      await client.query(
        `
        INSERT INTO stock_movements (
          warehouse_id, product_id, movement_type, quantity, unit_cost, batch_id, created_by, notes, production_order_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8, $9::uuid)
        `,
        [
          warehouseId,
          line.productId,
          movType,
          signedQty,
          unitCost,
          documentId,
          auth.userId,
          notes?.trim() || null,
          null,
        ]
      );
    }

    await client.query("COMMIT");

    const detail = await getDocument(pool, auth, documentId, warehouseId);
    if (!detail) throw new Error("document_confirm_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listDocuments(
  pool: pg.Pool,
  auth: AuthContext,
  opts?: {
    warehouseId?: string | null;
    docType?: DocType | "adjustment";
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ items: InventoryDocumentSummary[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const params: unknown[] = [];
  const whFilter = warehouseScopeSql(auth, opts?.warehouseId, "d", params);
  let typeFilter = "";
  if (opts?.docType === "entry") {
    typeFilter = ` AND d.doc_type = 'entry'`;
  } else if (opts?.docType === "exit") {
    typeFilter = ` AND d.doc_type IN ('exit', 'warranty', 'return')`;
  } else if (opts?.docType === "adjustment") {
    typeFilter = ` AND d.doc_type = 'adjustment'`;
  }

  let dateFilter = "";
  if (opts?.dateFrom) {
    params.push(opts.dateFrom);
    dateFilter += ` AND COALESCE(d.completed_at, d.created_at)::date >= $${params.length}::date`;
  }
  if (opts?.dateTo) {
    params.push(opts.dateTo);
    dateFilter += ` AND COALESCE(d.completed_at, d.created_at)::date <= $${params.length}::date`;
  }

  const countSql = `
    SELECT COUNT(*)::text AS c FROM inventory_documents d
    WHERE d.status IN ('completed', 'cancelled') AND (${whFilter}) ${typeFilter}${dateFilter}
  `;
  const { rows: countRows } = await pool.query<{ c: string }>(countSql, params);
  const total = Number(countRows[0]?.c ?? 0);

  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;
  const { rows } = await pool.query<{
    id: string;
    warehouse_id: string;
    warehouse_name: string;
    warehouse_code: string;
    doc_type: string;
    status: string;
    notes: string | null;
    reason: string | null;
    metadata: any;
    line_count: string;
    total_qty: string;
    total_amount: string;
    created_at: string;
    completed_at: string | null;
    created_by_name: string | null;
    invoice_number: string | null;
    exit_kind: ExitKind | null;
    customer_name: string | null;
    production_order_code: string | null;
    entry_type: string | null;
    labels_printed_at: string | null;
    edit_count: string;
    last_edit_observation: string | null;
    last_unlock_observation: string | null;
    editing_unlocked: boolean;
  }>(
    `
    SELECT
      d.id::text,
      d.warehouse_id::text,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      d.doc_type,
      d.status,
      d.notes,
      d.reason,
      d.metadata,
      COUNT(l.id)::text AS line_count,
      COALESCE(SUM(l.quantity), 0)::text AS total_qty,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0)::text AS total_amount,
      d.created_at::text,
      d.completed_at::text,
      u.full_name AS created_by_name,
      d.invoice_number,
      d.exit_kind,
      COALESCE(c.display_name, d.metadata->>'customerName') AS customer_name,
      d.metadata->>'productionOrderCode' AS production_order_code,
      d.metadata->>'entryType' AS entry_type,
      d.metadata->>'labelsPrintedAt' AS labels_printed_at,
      (
        SELECT COUNT(*)::text
        FROM document_status_events e
        WHERE e.document_id = d.id AND e.status = 'edited'
      ) AS edit_count,
      (
        SELECT e.comment
        FROM document_status_events e
        WHERE e.document_id = d.id AND e.status = 'edited'
        ORDER BY e.created_at DESC
        LIMIT 1
      ) AS last_edit_observation,
      (
        SELECT e.comment
        FROM document_status_events e
        WHERE e.document_id = d.id AND e.status = 'edit_unlocked'
        ORDER BY e.created_at DESC
        LIMIT 1
      ) AS last_unlock_observation,
      (d.editing_unlocked_at IS NOT NULL) AS editing_unlocked
    FROM inventory_documents d
    JOIN warehouses w ON w.id = d.warehouse_id
    LEFT JOIN inventory_document_lines l ON l.document_id = d.id
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.status IN ('completed', 'cancelled') AND (${whFilter}) ${typeFilter}${dateFilter}
    GROUP BY d.id, d.warehouse_id, w.name, w.code, u.full_name, d.invoice_number, d.exit_kind, c.display_name, d.metadata, d.reason
    ORDER BY d.completed_at DESC NULLS LAST, d.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    listParams
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      warehouseCode: r.warehouse_code,
      docType: r.doc_type as InventoryDocumentSummary["docType"],
      status: r.status,
      notes: r.notes,
      reason: r.reason,
      metadata: r.metadata ?? null,
      lineCount: Number(r.line_count),
      totalQuantity: Number(r.total_qty),
      createdAt: r.created_at,
      completedAt: r.completed_at,
      createdByName: r.created_by_name,
      invoiceNumber: r.invoice_number,
      exitKind: r.exit_kind,
      customerName: r.customer_name,
      productionOrderCode: r.production_order_code,
      entryType: r.entry_type,
      labelsPrintedAt: r.labels_printed_at,
      totalAmount: Number(r.total_amount),
      editCount: Number(r.edit_count),
      lastEditObservation: r.last_edit_observation,
      lastUnlockObservation: r.last_unlock_observation,
      editingUnlocked: r.editing_unlocked,
    })),
    total,
  };
}

export async function unlockDocumentEditing(
  pool: pg.Pool,
  auth: AuthContext,
  documentId: string,
  input: UnlockDocumentEditingInput
): Promise<InventoryDocumentDetail> {
  if (!canManageMovementEditing(auth)) {
    throw Object.assign(new Error("movement_edit_forbidden"), { code: "movement_edit_forbidden" });
  }

  const observation = input.observation?.trim();
  if (!observation) {
    throw Object.assign(new Error("observation_required"), { code: "observation_required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: docRows } = await client.query<{
      warehouse_id: string;
      status: string;
      is_today: boolean;
      already_unlocked: boolean;
    }>(
      `
      SELECT
        warehouse_id::text,
        status,
        (
          (COALESCE(completed_at, created_at) AT TIME ZONE $2)::date
          = (now() AT TIME ZONE $2)::date
        ) AS is_today,
        (editing_unlocked_at IS NOT NULL) AS already_unlocked
      FROM inventory_documents
      WHERE id = $1::uuid
      `,
      [documentId, MOVEMENT_EDIT_TZ]
    );
    const doc = docRows[0];
    if (!doc || doc.status !== "completed") {
      throw Object.assign(new Error("document_not_found"), { code: "document_not_found" });
    }
    if (!doc.is_today) {
      throw Object.assign(new Error("document_not_today"), { code: "document_not_today" });
    }

    if (!doc.already_unlocked) {
      await client.query(
        `
        UPDATE inventory_documents
        SET editing_unlocked_at = now(), editing_unlocked_by = $2::uuid
        WHERE id = $1::uuid
        `,
        [documentId, auth.userId]
      );
      await client.query(
        `
        INSERT INTO document_status_events (document_id, status, comment, actor_id)
        VALUES ($1::uuid, 'edit_unlocked', $2, $3::uuid)
        `,
        [documentId, observation, auth.userId]
      );
    }

    await client.query("COMMIT");

    const detail = await getDocument(pool, auth, documentId, doc.warehouse_id);
    if (!detail) throw new Error("document_unlock_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function editCompletedDocument(
  pool: pg.Pool,
  auth: AuthContext,
  documentId: string,
  input: EditCompletedDocumentInput
): Promise<InventoryDocumentDetail> {
  if (!canManageMovementEditing(auth)) {
    throw Object.assign(new Error("movement_edit_forbidden"), { code: "movement_edit_forbidden" });
  }

  const { movementKind, notes, customerName, relatedInvoiceNumber } = input;
  const parsed = parseMovementKind(movementKind);

  if (parsed.exitKind === "sale" && !customerName?.trim()) {
    throw Object.assign(new Error("customer_name_required"), { code: "customer_name_required" });
  }
  if (parsed.exitKind === "warranty" && !relatedInvoiceNumber?.trim()) {
    throw Object.assign(new Error("related_invoice_required"), { code: "related_invoice_required" });
  }

  const cleaned = mergeEditLines(input.lines);
  if (cleaned.length === 0) {
    throw Object.assign(new Error("lines_required"), { code: "lines_required" });
  }

  const includeCost = canSeeProductionCost(auth);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: docRows } = await client.query<{
      warehouse_id: string;
      doc_type: string;
      exit_kind: ExitKind | null;
      status: string;
      completed_at: string | null;
      created_at: string;
      is_today: boolean;
      editing_unlocked: boolean;
      invoice_number: string | null;
    }>(
      `
      SELECT
        warehouse_id::text,
        doc_type,
        exit_kind,
        status,
        completed_at::text,
        created_at::text,
        (
          (COALESCE(completed_at, created_at) AT TIME ZONE $2)::date
          = (now() AT TIME ZONE $2)::date
        ) AS is_today,
        (editing_unlocked_at IS NOT NULL) AS editing_unlocked,
        invoice_number
      FROM inventory_documents
      WHERE id = $1::uuid
      `,
      [documentId, MOVEMENT_EDIT_TZ]
    );
    const doc = docRows[0];
    if (!doc || doc.status !== "completed") {
      throw Object.assign(new Error("document_not_found"), { code: "document_not_found" });
    }

    if (!doc.is_today) {
      throw Object.assign(new Error("document_not_today"), { code: "document_not_today" });
    }

    if (!doc.editing_unlocked) {
      throw Object.assign(new Error("editing_not_unlocked"), { code: "editing_not_unlocked" });
    }

    const warehouseId = doc.warehouse_id;
    const exitKind = parsed.exitKind;
    const isEntry = parsed.isEntry;
    const movementType = isEntry
      ? movementTypeFor("entry")
      : movementTypeForExitKind(exitKind!);

    const metadata = isEntry
      ? {}
      : {
          exitKind: exitKind!,
          customerName: customerName?.trim() || null,
          relatedInvoiceNumber: relatedInvoiceNumber?.trim() || null,
          exitKindLabel: exitKindLabel(exitKind!),
        };

    const customerId = isEntry ? null : await resolveCustomerId(client, customerName);

    const { rows: oldMovements } = await client.query<{
      product_id: string;
      quantity: string;
    }>(
      `SELECT product_id::text, quantity::text
       FROM stock_movements WHERE batch_id = $1::uuid`,
      [documentId]
    );

    for (const mov of oldMovements) {
      await client.query(
        `
        INSERT INTO stock_movements (
          warehouse_id, product_id, movement_type, quantity, batch_id, created_by, notes
        )
        VALUES ($1::uuid, $2::uuid, 'adjustment', $3, $4::uuid, $5::uuid, $6)
        `,
        [
          warehouseId,
          mov.product_id,
          -Number(mov.quantity),
          documentId,
          auth.userId,
          "Reversión edición · anula movimiento anterior",
        ]
      );
    }

    await client.query(`DELETE FROM inventory_document_lines WHERE document_id = $1::uuid`, [documentId]);

    await client.query(
      `
      UPDATE inventory_documents
      SET
        doc_type = $2,
        exit_kind = $3,
        notes = $4,
        metadata = $5::jsonb,
        customer_id = $6::uuid,
        reason = $7
      WHERE id = $1::uuid
      `,
      [
        documentId,
        parsed.docType,
        exitKind,
        notes?.trim() || null,
        JSON.stringify(metadata),
        customerId,
        isEntry ? null : exitKindLabel(exitKind!),
      ]
    );

    for (const line of cleaned) {
      const { rows: products } = await client.query<{
        base_sale_price: string;
        production_cost: string;
        name: string;
        is_active: boolean;
      }>(
        `SELECT base_sale_price::text, production_cost::text, name, is_active
         FROM products WHERE id = $1::uuid`,
        [line.productId]
      );
      const product = products[0];
      if (!product?.is_active) {
        throw Object.assign(new Error("product_not_found"), { code: "product_not_found", productId: line.productId });
      }

      if (!isEntry && exitKind !== "return") {
        const { rows: stockRows } = await client.query<{ qty: string }>(
          `
          SELECT COALESCE(SUM(quantity), 0)::text AS qty
          FROM stock_movements
          WHERE warehouse_id = $1::uuid AND product_id = $2::uuid
          `,
          [warehouseId, line.productId]
        );
        const onHand = Number(stockRows[0]?.qty ?? 0);
        if (onHand < line.quantity) {
          throw Object.assign(new Error("insufficient_stock"), {
            code: "insufficient_stock",
            productId: line.productId,
            productName: product.name,
            available: onHand,
            requested: line.quantity,
          });
        }
      }

      const suggested = Number(product.base_sale_price);
      const unitSale = isEntry
        ? suggested
        : resolveUnitSalePrice(line.unitSalePrice, suggested);
      const unitCost = includeCost ? Number(product.production_cost) : null;

      const signedQty = isEntry
        ? signedQuantity("entry", line.quantity)
        : signedQuantityForExit(exitKind!, line.quantity);

      await client.query(
        `
        INSERT INTO inventory_document_lines (
          document_id, product_id, quantity, unit_cost, unit_sale_price
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
        `,
        [documentId, line.productId, line.quantity, unitCost, unitSale]
      );

      await client.query(
        `
        INSERT INTO stock_movements (
          warehouse_id, product_id, movement_type, quantity, unit_cost, batch_id, created_by, notes
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8)
        `,
        [
          warehouseId,
          line.productId,
          movementType,
          signedQty,
          unitCost,
          documentId,
          auth.userId,
          "Cambios aplicados",
        ]
      );
    }

    const auditLabel = isEntry ? "Entrada" : exitKindLabel(exitKind!);
    await client.query(
      `
      INSERT INTO document_status_events (document_id, status, comment, actor_id)
      VALUES ($1::uuid, 'edited', $2, $3::uuid)
      `,
      [
        documentId,
        `Guardado: ${auditLabel} · ${cleaned.length} línea(s)${doc.invoice_number ? ` · ${doc.invoice_number}` : ""}`,
        auth.userId,
      ]
    );

    await client.query(
      `
      UPDATE inventory_documents
      SET editing_unlocked_at = NULL, editing_unlocked_by = NULL
      WHERE id = $1::uuid
      `,
      [documentId]
    );

    await client.query("COMMIT");

    const detail = await getDocument(pool, auth, documentId, warehouseId);
    if (!detail) throw new Error("document_edit_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getDocument(
  pool: pg.Pool,
  auth: AuthContext,
  documentId: string,
  warehouseId?: string | null
): Promise<InventoryDocumentDetail | null> {
  const params: unknown[] = [documentId];
  const whFilter = warehouseScopeSql(auth, warehouseId, "d", params);

  const { rows } = await pool.query<{
    warehouse_id: string;
    id: string;
    doc_type: string;
    status: string;
    notes: string | null;
    reason: string | null;
    line_count: string;
    total_qty: string;
    total_amount: string;
    created_at: string;
    completed_at: string | null;
    created_by_name: string | null;
    invoice_number: string | null;
    exit_kind: ExitKind | null;
    metadata: any;
    warehouse_name: string;
    warehouse_code: string;
    customer_name: string | null;
    customer_tax_id: string | null;
    customer_phone: string | null;
    customer_address: string | null;
    editing_unlocked: boolean;
    edit_count: string;
    last_edit_observation: string | null;
    last_unlock_observation: string | null;
  }>(
    `
    SELECT
      d.id::text,
      d.warehouse_id::text,
      d.doc_type,
      d.status,
      d.notes,
      d.reason,
      COUNT(l.id)::text AS line_count,
      COALESCE(SUM(l.quantity), 0)::text AS total_qty,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0)::text AS total_amount,
      d.created_at::text,
      d.completed_at::text,
      u.full_name AS created_by_name,
      d.invoice_number,
      d.exit_kind,
      d.metadata,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      COALESCE(c.display_name, d.metadata->>'customerName') AS customer_name,
      c.tax_id AS customer_tax_id,
      c.phone AS customer_phone,
      c.address AS customer_address,
      (d.editing_unlocked_at IS NOT NULL) AS editing_unlocked,
      (
        SELECT COUNT(*)::text
        FROM document_status_events e
        WHERE e.document_id = d.id AND e.status = 'edited'
      ) AS edit_count,
      (
        SELECT e.comment
        FROM document_status_events e
        WHERE e.document_id = d.id AND e.status = 'edited'
        ORDER BY e.created_at DESC
        LIMIT 1
      ) AS last_edit_observation,
      (
        SELECT e.comment
        FROM document_status_events e
        WHERE e.document_id = d.id AND e.status = 'edit_unlocked'
        ORDER BY e.created_at DESC
        LIMIT 1
      ) AS last_unlock_observation
    FROM inventory_documents d
    JOIN warehouses w ON w.id = d.warehouse_id
    LEFT JOIN inventory_document_lines l ON l.document_id = d.id
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.id = $1::uuid AND (${whFilter})
    GROUP BY d.id, d.warehouse_id, u.full_name, w.name, w.code, c.display_name, c.tax_id, c.phone, c.address, d.metadata, d.reason
    `,
    params
  );
  const head = rows[0];
  if (!head) return null;

  const meta = head.metadata ?? {};

  const { rows: lineRows } = await pool.query<{
    id: string;
    product_id: string;
    product_name: string;
    reference_code: string;
    barcode: string | null;
    image_url: string | null;
    quantity: string;
    unit_sale_price: string | null;
    unit_cost: string | null;
  }>(
    `
    SELECT
      l.id::text,
      l.product_id::text,
      p.name AS product_name,
      p.reference_code,
      p.barcode,
      (
        SELECT COALESCE(
          NULLIF(pi.variants->>'sm', ''),
          NULLIF(pi.variants->>'xs', ''),
          NULLIF(pi.variants->>'md', ''),
          pi.thumb_url,
          pi.url
        )
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1
      ) AS image_url,
      l.quantity::text,
      l.unit_sale_price::text,
      l.unit_cost::text
    FROM inventory_document_lines l
    JOIN products p ON p.id = l.product_id
    WHERE l.document_id = $1::uuid
    ORDER BY p.name
    `,
    [documentId]
  );

  return {
    id: head.id,
    warehouseId: head.warehouse_id,
    docType: head.doc_type as InventoryDocumentSummary["docType"],
    status: head.status,
    notes: head.notes,
    reason: head.reason,
    lineCount: Number(head.line_count),
    totalQuantity: Number(head.total_qty),
    createdAt: head.created_at,
    completedAt: head.completed_at,
    createdByName: head.created_by_name,
    invoiceNumber: head.invoice_number,
    exitKind: head.exit_kind,
    customerName: head.customer_name ?? meta.customerName ?? null,
    customerTaxId: head.customer_tax_id ?? null,
    customerPhone: head.customer_phone ?? null,
    customerAddress: head.customer_address ?? null,
    relatedInvoiceNumber: meta.relatedInvoiceNumber ?? null,
    productionOrderCode: meta.productionOrderCode ?? null,
    entryType: meta.entryType ?? null,
    labelsPrintedAt: meta.labelsPrintedAt ?? null,
    warehouseName: head.warehouse_name,
    warehouseCode: head.warehouse_code,
    totalAmount: Number(head.total_amount),
    editCount: Number(head.edit_count),
    lastEditObservation: head.last_edit_observation,
    lastUnlockObservation: head.last_unlock_observation,
    editingUnlocked: head.editing_unlocked,
    metadata: meta,
    lines: lineRows.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      referenceCode: l.reference_code,
      barcode: l.barcode,
      imageUrl: l.image_url,
      quantity: Number(l.quantity),
      unitSalePrice: l.unit_sale_price != null ? Number(l.unit_sale_price) : null,
      unitCost: l.unit_cost != null ? Number(l.unit_cost) : null,
    })),
    events: await listDocumentEvents(pool, documentId),
  };
}

export async function cancelDocument(
  pool: pg.Pool,
  auth: AuthContext,
  documentId: string,
  _warehouseId?: string | null
): Promise<InventoryDocumentDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: docRows } = await client.query<{
      warehouse_id: string;
      status: string;
      invoice_number: string | null;
      doc_type: string;
    }>(
      `SELECT warehouse_id::text, status, invoice_number, doc_type
       FROM inventory_documents
       WHERE id = $1::uuid`,
      [documentId]
    );

    const doc = docRows[0];
    if (!doc) {
      throw Object.assign(new Error("document_not_found"), { code: "document_not_found" });
    }
    if (doc.status === "cancelled") {
      throw Object.assign(new Error("document_already_cancelled"), { code: "document_already_cancelled" });
    }

    await client.query(
      `DELETE FROM stock_movements WHERE batch_id = $1::uuid`,
      [documentId]
    );

    await client.query(
      `UPDATE inventory_documents
       SET status = 'cancelled'
       WHERE id = $1::uuid`,
      [documentId]
    );

    await client.query(
      `INSERT INTO document_status_events (document_id, status, comment, actor_id)
       VALUES ($1::uuid, 'cancelled', $2, $3::uuid)`,
      [documentId, "Comprobante anulado - Stock restituido", auth.userId]
    );

    await client.query("COMMIT");

    const detail = await getDocument(pool, auth, documentId, doc.warehouse_id);
    if (!detail) throw new Error("document_cancel_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Marca las etiquetas de una Orden de producción como impresas (una sola vez).
 * Si ya fueron impresas, lanza `labels_already_printed`.
 */
export async function markLabelsPrinted(
  pool: pg.Pool,
  auth: AuthContext,
  documentId: string,
  _warehouseId?: string | null
): Promise<InventoryDocumentDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: docRows } = await client.query<{
      warehouse_id: string;
      status: string;
      doc_type: string;
      metadata: any;
    }>(
      `SELECT warehouse_id::text, status, doc_type, metadata
       FROM inventory_documents
       WHERE id = $1::uuid
       FOR UPDATE`,
      [documentId]
    );

    const doc = docRows[0];
    if (!doc) {
      throw Object.assign(new Error("document_not_found"), { code: "document_not_found" });
    }
    const meta = doc.metadata ?? {};
    const isProductionOrder =
      doc.doc_type === "entry" &&
      (meta.entryType === "production_order" || Boolean(meta.productionOrderCode));
    if (!isProductionOrder) {
      throw Object.assign(new Error("not_a_production_order"), { code: "not_a_production_order" });
    }
    if (doc.status === "cancelled") {
      throw Object.assign(new Error("document_already_cancelled"), { code: "document_already_cancelled" });
    }

    const printedAt = new Date().toISOString();
    const nextMeta = { ...meta, labelsPrintedAt: printedAt, labelsPrintedBy: auth.userId };
    await client.query(
      `UPDATE inventory_documents SET metadata = $2::jsonb WHERE id = $1::uuid`,
      [documentId, JSON.stringify(nextMeta)]
    );

    await client.query("COMMIT");

    const detail = await getDocument(pool, auth, documentId, doc.warehouse_id);
    if (!detail) throw new Error("labels_print_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export { getMovementEditSettings, updateMovementEditSettings } from "./movement-edit-settings.js";
export type { MovementEditSettings } from "./movement-edit-settings.js";
export type { DocumentStatusEventView } from "./document-events.js";
