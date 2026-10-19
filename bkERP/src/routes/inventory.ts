import { Router } from "express";
import { getPool } from "../db.js";
import { firstPathParam } from "../lib/path-params.js";
import { canManageInventory } from "../lib/inventory-permissions.js";
import { isUuid } from "../lib/uuid.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRoles.js";
import { requireWarehouse, resolveWarehouseOptional } from "../middleware/requireWarehouse.js";
import { findProductByScan, listCatalog, listProductCatalog } from "../services/inventory/catalog.js";
import {
  getStockSemaphoreSummary,
  listStockSemaphore,
} from "../services/inventory/semaphore.js";
import type { StockSignal } from "../services/inventory/types.js";
import { productImageUpload } from "../middleware/productImageUpload.js";
import {
  confirmDocument,
  confirmExitDocument,
  editCompletedDocument,
  type ExitKind,
  getDocument,
  listDocuments,
  unlockDocumentEditing,
  type DocType,
  cancelDocument,
  markLabelsPrinted,
  lookupOriginExitForEntry,
  type LinkedEntryType,
} from "../services/inventory/documents.js";
import { generateProductBarcode } from "../lib/barcode.js";
import { addProductImages, deleteProductImage } from "../services/inventory/images.js";
import { getUtilitiesSummary } from "../services/inventory/utilities.js";
import {
  createCategory,
  createProduct,
  getProductDetail,
  listCategories,
  updateProduct,
  type CreateProductInput,
} from "../services/inventory/products.js";
import {
  cancelCount,
  confirmCount,
  getCount,
  getOpenCount,
  listCounts,
  openCount,
  resetCountedQuantities,
  updateCountLine,
  type CountKind,
  type CountStatus,
} from "../services/inventory/counts.js";

const manageInventory = (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (!req.auth || !canManageInventory(req.auth)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
};

type ParsedConfirmLine = {
  productId: string;
  quantity: number;
  unitSalePrice?: number;
  isReturn?: boolean;
};

function parseConfirmLines(
  rawLines: unknown,
  opts?: { unitSalePrice?: boolean }
): ParsedConfirmLine[] | null {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null;
  const lines: ParsedConfirmLine[] = [];
  for (const row of rawLines) {
    const productId = typeof (row as { productId?: string })?.productId === "string"
      ? (row as { productId: string }).productId.trim()
      : "";
    const quantity = Number((row as { quantity?: unknown })?.quantity);
    if (!isUuid(productId) || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    const line: ParsedConfirmLine = { productId, quantity };
    if (opts?.unitSalePrice) {
      const raw = (row as { unitSalePrice?: unknown }).unitSalePrice;
      if (raw != null && raw !== "") {
        const unitSalePrice = Number(raw);
        if (!Number.isFinite(unitSalePrice) || unitSalePrice < 0) return null;
        line.unitSalePrice = unitSalePrice;
      }
    }
    const isReturn = (row as { isReturn?: unknown }).isReturn;
    if (typeof isReturn === "boolean") {
      line.isReturn = isReturn;
    }
    lines.push(line);
  }
  return lines;
}

export function createInventoryRouter(): Router {
  const r = Router();

  r.use(requireAuth);

  const superAdminOnly = requireAnyRole("super_admin");
  const movementEditManagers = requireAnyRole("super_admin", "secretaria");

  r.get("/utilities/summary", requireAuth, superAdminOnly, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    let warehouseId: string | null = null;
    const qWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";
    if (qWh) {
      if (!isUuid(qWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (auth.warehouseIds !== null && !auth.warehouseIds.includes(qWh)) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      warehouseId = qWh;
    }
    try {
      const summary = await getUtilitiesSummary(pool, warehouseId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  r.get("/categories", async (_req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    try {
      const items = await listCategories(pool);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  r.post("/categories", manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    try {
      const item = await createCategory(pool, name);
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  r.get("/product-catalog", async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;

    try {
      const result = await listProductCatalog(pool, req.auth!, {
        q,
        categoryId,
        status,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.get("/catalog", requireWarehouse, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const withoutBarcode =
      req.query.withoutBarcode === "1" || req.query.withoutBarcode === "true";
    const withBarcode = req.query.withBarcode === "1" || req.query.withBarcode === "true";
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;

    try {
      const result = await listCatalog(pool, req.auth!, {
        warehouseId: req.warehouseId!,
        q,
        categoryId,
        status,
        withoutBarcode: withoutBarcode || undefined,
        withBarcode: withBarcode || undefined,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.get("/semaphore/summary", requireWarehouse, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    try {
      const summary = await getStockSemaphoreSummary(pool, req.warehouseId!);
      res.json({ summary, warehouseId: req.warehouseId });
    } catch (err) {
      next(err);
    }
  });

  r.get("/semaphore", requireWarehouse, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawSignal = typeof req.query.signal === "string" ? req.query.signal : undefined;
    const signal =
      rawSignal && ["ok", "low", "critical", "out"].includes(rawSignal)
        ? (rawSignal as StockSignal)
        : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;

    try {
      const result = await listStockSemaphore(pool, req.auth!, {
        warehouseId: req.warehouseId!,
        signal,
        q,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.get("/documents", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    const docType =
      req.query.docType === "entry" ||
      req.query.docType === "exit" ||
      req.query.docType === "adjustment"
        ? req.query.docType
        : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    const dateFrom =
      typeof req.query.dateFrom === "string" && ymdRe.test(req.query.dateFrom.trim())
        ? req.query.dateFrom.trim()
        : undefined;
    const dateTo =
      typeof req.query.dateTo === "string" && ymdRe.test(req.query.dateTo.trim())
        ? req.query.dateTo.trim()
        : undefined;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      res.status(400).json({ error: "invalid_date_range" });
      return;
    }
    let warehouseId: string | null = null;
    const qWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";
    if (qWh) {
      if (!isUuid(qWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (auth.warehouseIds !== null && !auth.warehouseIds.includes(qWh)) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      warehouseId = qWh;
    } else if (auth.warehouseIds !== null && !auth.hasAdminAccess) {
      if (auth.warehouseIds.length === 1) {
        warehouseId = auth.warehouseIds[0]!;
      } else if (auth.warehouseIds.length === 0) {
        res.json({ items: [], total: 0 });
        return;
      } else {
        res.status(400).json({ error: "warehouse_id_required" });
        return;
      }
    }
    try {
      const result = await listDocuments(pool, auth, {
        warehouseId,
        docType,
        dateFrom,
        dateTo,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.post("/documents/:id/unlock-edit", requireAuth, movementEditManagers, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const observation = typeof req.body?.observation === "string" ? req.body.observation.trim() : "";
    if (!observation) {
      res.status(400).json({ error: "observation_required" });
      return;
    }
    try {
      const item = await unlockDocumentEditing(pool, auth, id, { observation });
      res.json({ item });
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "document_not_found") {
        res.status(404).json({ error: e.code });
        return;
      }
      if (e?.code === "document_not_today" || e?.code === "movement_edit_forbidden") {
        res.status(403).json({ error: e.code });
        return;
      }
      if (e?.code === "observation_required") {
        res.status(400).json({ error: e.code });
        return;
      }
      next(err);
    }
  });

  r.patch("/documents/:id", requireAuth, movementEditManagers, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const movementKind = req.body?.movementKind;
    const allowUnitSale = movementKind !== "entry";
    const lines = parseConfirmLines(req.body?.lines, { unitSalePrice: allowUnitSale });
    if (!lines) {
      res.status(400).json({ error: "invalid_lines" });
      return;
    }
    const validKinds = ["entry", "sale", "return", "credit", "warranty"] as const;
    if (!movementKind || !validKinds.includes(movementKind)) {
      res.status(400).json({ error: "invalid_movement_kind" });
      return;
    }
    const customerName =
      typeof req.body?.customerName === "string" ? req.body.customerName : undefined;
    const relatedInvoiceNumber =
      typeof req.body?.relatedInvoiceNumber === "string" ? req.body.relatedInvoiceNumber : undefined;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

    try {
      const item = await editCompletedDocument(pool, auth, id, {
        movementKind,
        lines,
        customerName,
        relatedInvoiceNumber,
        notes,
      });
      res.json({ item });
    } catch (err) {
      const e = err as {
        code?: string;
        productId?: string;
        productName?: string;
        available?: number;
        requested?: number;
      };
      if (e?.code === "document_not_found") {
        res.status(404).json({ error: e.code });
        return;
      }
      if (
        e?.code === "document_not_today" ||
        e?.code === "editing_not_unlocked" ||
        e?.code === "movement_edit_forbidden"
      ) {
        res.status(403).json({ error: e.code });
        return;
      }
      if (
        e?.code === "lines_required" ||
        e?.code === "customer_name_required" ||
        e?.code === "related_invoice_required" ||
        e?.code === "sale_price_below_suggested"
      ) {
        res.status(400).json({ error: e.code });
        return;
      }
      if (e?.code === "insufficient_stock") {
        res.status(409).json({
          error: "insufficient_stock",
          productId: e.productId,
          productName: e.productName,
          available: e.available,
          requested: e.requested,
        });
        return;
      }
      next(err);
    }
  });

  r.post("/documents/:id/cancel", requireAuth, movementEditManagers, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    let warehouseId: string | null = null;
    const qWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";
    if (qWh) {
      if (!isUuid(qWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (auth.warehouseIds !== null && !auth.warehouseIds.includes(qWh)) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      warehouseId = qWh;
    }
    try {
      const item = await cancelDocument(pool, auth, id, warehouseId);
      res.json({ item });
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "document_not_found") {
        res.status(404).json({ error: e.code });
        return;
      }
      if (e?.code === "document_already_cancelled" || e?.code === "movement_edit_forbidden") {
        res.status(403).json({ error: e.code });
        return;
      }
      next(err);
    }
  });

  /** Marca etiquetas de una OP como impresas (solo una vez). */
  r.post("/documents/:id/mark-labels-printed", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    if (!canManageInventory(auth)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    let warehouseId: string | null = null;
    const qWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";
    if (qWh) {
      if (!isUuid(qWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (auth.warehouseIds !== null && !auth.warehouseIds.includes(qWh)) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      warehouseId = qWh;
    }
    try {
      const item = await markLabelsPrinted(pool, auth, id, warehouseId);
      res.json({ item });
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "document_not_found") {
        res.status(404).json({ error: e.code });
        return;
      }
      if (
        e?.code === "not_a_production_order" ||
        e?.code === "document_already_cancelled" ||
        e?.code === "labels_already_printed"
      ) {
        res.status(403).json({ error: e.code });
        return;
      }
      next(err);
    }
  });

  r.get("/documents/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    let warehouseId: string | null = null;
    const qWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";
    if (qWh) {
      if (!isUuid(qWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (auth.warehouseIds !== null && !auth.warehouseIds.includes(qWh)) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      warehouseId = qWh;
    }
    try {
      const item = await getDocument(pool, auth, id, warehouseId);
      if (!item) {
        res.status(404).json({ error: "document_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  r.post("/documents/confirm-exit", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const exitKind = req.body?.exitKind as ExitKind | undefined;
    const validKinds: ExitKind[] = ["sale", "return", "credit", "warranty", "distribution", "transfer", "return_to_factory", "exchange"];
    if (!exitKind || !validKinds.includes(exitKind)) {
      res.status(400).json({ error: "invalid_exit_kind" });
      return;
    }
    const lines = parseConfirmLines(req.body?.lines, { unitSalePrice: true });
    if (!lines) {
      res.status(400).json({ error: "invalid_line" });
      return;
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const customerName = typeof req.body?.customerName === "string" ? req.body.customerName : null;
    const relatedInvoiceNumber =
      typeof req.body?.relatedInvoiceNumber === "string" ? req.body.relatedInvoiceNumber : null;
    const rawPaymentBreakdown = req.body?.paymentBreakdown;
    const paymentBreakdown =
      rawPaymentBreakdown == null
        ? null
        : Array.isArray(rawPaymentBreakdown) &&
            rawPaymentBreakdown.length > 0 &&
            rawPaymentBreakdown.every(
              (part) =>
                part &&
                typeof part.method === "string" &&
                part.method.trim() &&
                Number.isFinite(Number(part.amount)) &&
                Number(part.amount) > 0
            )
          ? rawPaymentBreakdown.map((part) => ({
              method: part.method.trim(),
              amount: Number(part.amount),
            }))
          : undefined;
    if (paymentBreakdown === undefined) {
      res.status(400).json({ error: "invalid_payment_breakdown" });
      return;
    }
    try {
      const item = await confirmExitDocument(pool, req.auth!, req.warehouseId!, {
        exitKind,
        lines,
        notes,
        customerName,
        relatedInvoiceNumber,
        customerId: typeof req.body?.customerId === "string" ? req.body.customerId : null,
        paymentMethod: typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : null,
        paymentBreakdown,
        destinationWarehouseId:
          typeof req.body?.destinationWarehouseId === "string" ? req.body.destinationWarehouseId : null,
        layawayId: typeof req.body?.layawayId === "string" ? req.body.layawayId : null,
        receiptUrl: typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl : null,
        receiptFilename: typeof req.body?.receiptFilename === "string" ? req.body.receiptFilename : null,
      });
      res.status(201).json({ item });
    } catch (err: unknown) {
      const e = err as {
        code?: string;
        productName?: string;
        available?: number;
        requested?: number;
        suggested?: number;
      };
      const clientCodes = new Set([
        "sale_price_below_suggested",
        "insufficient_stock",
        "customer_name_required",
        "payment_total_mismatch",
        "related_invoice_required",
        "destination_warehouse_required",
        "destination_warehouse_not_found",
        "destination_same_as_origin",
        "distribution_requires_factory",
        "return_destination_must_be_factory",
        "exchange_lines_required",
        "exchange_net_value_required",
        "lines_required",
        "initial_payment_exceeds_total",
        "insufficient_credit_balance",
        "layaway_not_found",
        "layaway_not_active",
      ]);
      if (e?.code && clientCodes.has(e.code)) {
        res.status(e.code === "insufficient_stock" ? 409 : 400).json({
          error: e.code,
          productName: e.productName,
          available: e.available,
          requested: e.requested,
          suggested: e.suggested,
        });
        return;
      }
      next(err);
    }
  });

  r.post("/documents/confirm", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const docType = req.body?.docType;
    if (docType !== "entry" && docType !== "exit") {
      res.status(400).json({ error: "invalid_doc_type" });
      return;
    }
    const rawLines = req.body?.lines;
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      res.status(400).json({ error: "lines_required" });
      return;
    }
    const lines: { productId: string; quantity: number }[] = [];
    for (const row of rawLines) {
      const productId = typeof row?.productId === "string" ? row.productId : "";
      const quantity = Number(row?.quantity);
      if (!isUuid(productId) || !(quantity > 0)) {
        res.status(400).json({ error: "invalid_line" });
        return;
      }
      lines.push({ productId, quantity });
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const entryType = typeof req.body?.entryType === "string" ? req.body.entryType : null;
    const originInvoiceNumber = typeof req.body?.originInvoiceNumber === "string" ? req.body.originInvoiceNumber : null;
    try {
      const item = await confirmDocument(
        pool,
        req.auth!,
        req.warehouseId!,
        docType as DocType,
        lines,
        notes,
        entryType,
        originInvoiceNumber
      );
      res.status(201).json({ item });
    } catch (err: unknown) {
      const e = err as { code?: string; productName?: string; available?: number; requested?: number };
      const entryCodes = new Set([
        "insufficient_stock",
        "lines_required",
        "origin_invoice_required",
        "origin_invoice_not_found",
        "origin_invoice_wrong_type",
        "origin_invoice_missing_destination",
        "origin_invoice_wrong_destination",
        "origin_invoice_already_received",
        "production_order_requires_factory",
        "entry_line_not_in_origin",
        "entry_qty_exceeds_origin",
        "entry_missing_origin_lines",
      ]);
      if (e?.code && entryCodes.has(e.code)) {
        res.status(e.code === "insufficient_stock" || e.code === "origin_invoice_already_received" ? 409 : 400).json({
          error: e.code,
          productName: e.productName,
          available: e.available,
          requested: e.requested,
        });
        return;
      }
      next(err);
    }
  });

  r.get("/scan/:code", requireWarehouse, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const code = firstPathParam(req.params.code);
    if (!code) {
      res.status(400).json({ error: "code_required" });
      return;
    }
    try {
      const item = await findProductByScan(pool, req.auth!, req.warehouseId!, decodeURIComponent(code));
      if (!item) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  r.post(
    "/products/:id/images",
    manageInventory,
    productImageUpload.array("images", 8),
    async (req, res, next) => {
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: "database_not_configured" });
        return;
      }
      const id = firstPathParam(req.params.id);
      if (!id || !isUuid(id)) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        res.status(400).json({ error: "images_required" });
        return;
      }
      try {
        const images = await addProductImages(
          pool,
          id,
          files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }))
        );
        res.status(201).json({ images });
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e?.code === "invalid_image_type" || e?.message === "invalid_image_type") {
          res.status(400).json({ error: "invalid_image_type" });
          return;
        }
        if (e?.code === "too_many_images") {
          res.status(400).json({ error: "too_many_images" });
          return;
        }
        if (e?.code === "product_not_found") {
          res.status(404).json({ error: "product_not_found" });
          return;
        }
        next(err);
      }
    }
  );

  r.delete("/products/:id/images/:imageId", manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const productId = firstPathParam(req.params.id);
    const imageId = firstPathParam(req.params.imageId);
    if (!productId || !isUuid(productId) || !imageId || !isUuid(imageId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const ok = await deleteProductImage(pool, productId, imageId);
      if (!ok) {
        res.status(404).json({ error: "image_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get("/products/:id", resolveWarehouseOptional, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const item = await getProductDetail(pool, req.auth!, req.warehouseId ?? null, id);
      if (!item) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  r.post("/products", resolveWarehouseOptional, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const referenceCode = typeof body.referenceCode === "string" ? body.referenceCode.trim() : "";
    if (!name || !referenceCode) {
      res.status(400).json({ error: "name_and_reference_required" });
      return;
    }

    const input: CreateProductInput = {
      name,
      referenceCode,
      sku: body.sku ?? null,
      internalCode: body.internalCode ?? null,
      description: body.description ?? null,
      categoryId: body.categoryId ?? null,
      brand: body.brand ?? null,
      unit: body.unit ?? "und",
      status: body.status ?? "active",
      baseSalePrice: Number(body.baseSalePrice ?? 0),
      productionCost: body.productionCost != null ? Number(body.productionCost) : undefined,
      minStockLevel: body.minStockLevel != null ? Number(body.minStockLevel) : undefined,
      criticalStockLevel: body.criticalStockLevel != null ? Number(body.criticalStockLevel) : undefined,
      initialStock: body.initialStock != null ? Number(body.initialStock) : undefined,
      barcode: body.barcode ?? null,
      hasBarcode: typeof body.hasBarcode === "boolean" ? body.hasBarcode : undefined,
      imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : undefined,
      warehousePrices: Array.isArray(body.warehousePrices)
        ? body.warehousePrices
            .filter(
              (p: { warehouseId?: unknown; salePrice?: unknown }) =>
                typeof p?.warehouseId === "string" && p.warehouseId.length > 0
            )
            .map((p: { warehouseId: string; salePrice: unknown }) => ({
              warehouseId: p.warehouseId,
              salePrice:
                p.salePrice != null && p.salePrice !== "" && Number.isFinite(Number(p.salePrice))
                  ? Number(p.salePrice)
                  : null,
            }))
        : undefined,
    };

    try {
      const stockWarehouseId = req.warehouseId ?? null;
      const item = await createProduct(pool, req.auth!, stockWarehouseId, input);
      res.status(201).json({ item });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "23505") {
        res.status(409).json({ error: "duplicate_code_or_barcode" });
        return;
      }
      next(err);
    }
  });

  r.patch("/products/:id", resolveWarehouseOptional, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const body = req.body ?? {};
    try {
      const item = await updateProduct(pool, req.auth!, id, {
        referenceCode: body.referenceCode,
        sku: body.sku,
        internalCode: body.internalCode,
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        brand: body.brand,
        unit: body.unit,
        status: body.status,
        isActive: body.isActive,
        baseSalePrice: body.baseSalePrice != null ? Number(body.baseSalePrice) : undefined,
        productionCost: body.productionCost != null ? Number(body.productionCost) : undefined,
        minStockLevel: body.minStockLevel != null ? Number(body.minStockLevel) : undefined,
        criticalStockLevel: body.criticalStockLevel != null ? Number(body.criticalStockLevel) : undefined,
        barcode: body.barcode,
        warehousePrices: Array.isArray(body.warehousePrices)
          ? body.warehousePrices
              .filter(
                (p: { warehouseId?: unknown; salePrice?: unknown }) =>
                  typeof p?.warehouseId === "string" && p.warehouseId.length > 0
              )
              .map((p: { warehouseId: string; salePrice: unknown }) => ({
                warehouseId: p.warehouseId,
                salePrice:
                  p.salePrice != null && p.salePrice !== "" && Number.isFinite(Number(p.salePrice))
                    ? Number(p.salePrice)
                    : null,
              }))
          : undefined,
      }, req.warehouseId ?? null);
      if (!item) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      res.json({ item });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "23505") {
        res.status(409).json({ error: "duplicate_code_or_barcode" });
        return;
      }
      next(err);
    }
  });

  r.post("/products/bulk", manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawProducts = req.body?.products;
    const updateExisting =
      req.body?.updateExisting !== undefined ? Boolean(req.body.updateExisting) : true;
    const defaultCategoryId =
      typeof req.body?.categoryId === "string" && isUuid(req.body.categoryId)
        ? req.body.categoryId
        : null;
    const defaultHasBarcode =
      typeof req.body?.hasBarcode === "boolean" ? req.body.hasBarcode : true;

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      res.status(400).json({ error: "products_required" });
      return;
    }

    const client = await pool.connect();
    let imported = 0;
    let updated = 0;
    let duplicates = 0;

    try {
      await client.query("BEGIN");

      for (let idx = 0; idx < rawProducts.length; idx++) {
        const p = rawProducts[idx];
        const name = typeof p?.name === "string" ? p.name.trim() : "";
        const referenceCode =
          typeof p?.referenceCode === "string" ? p.referenceCode.trim().toUpperCase() : "";
        const baseSalePrice = Number(p?.baseSalePrice) || 0;
        const productionCost = p?.productionCost != null ? Number(p.productionCost) || 0 : 0;
        const categoryId =
          typeof p?.categoryId === "string" && isUuid(p.categoryId)
            ? p.categoryId
            : defaultCategoryId;
        const hasBarcode =
          typeof p?.hasBarcode === "boolean" ? p.hasBarcode : defaultHasBarcode;

        if (!name || !referenceCode) continue;

        const marginPercent =
          baseSalePrice > 0
            ? Math.round(((baseSalePrice - productionCost) / baseSalePrice) * 10000) / 100
            : null;
        const barcode = hasBarcode ? generateProductBarcode(referenceCode) : null;
        const savepoint = `sp_bulk_${idx}`;

        await client.query(`SAVEPOINT ${savepoint}`);
        try {
          if (updateExisting) {
            const { rows: existing } = await client.query<{ id: string }>(
              `SELECT id::text FROM products WHERE upper(reference_code) = $1 OR upper(internal_code) = $1 LIMIT 1`,
              [referenceCode]
            );
            if (existing[0]) {
              await client.query(
                `UPDATE products
                 SET name = $1,
                     reference_code = $2,
                     internal_code = $2,
                     base_sale_price = $3,
                     production_cost = CASE WHEN $4 > 0 THEN $4 ELSE production_cost END,
                     margin_percent = $5,
                     category_id = COALESCE($6::uuid, category_id),
                     barcode = $7,
                     updated_at = now()
                 WHERE id = $8::uuid`,
                [
                  name,
                  referenceCode,
                  baseSalePrice,
                  productionCost,
                  marginPercent,
                  categoryId,
                  barcode,
                  existing[0].id,
                ]
              );
              updated++;
              await client.query(`RELEASE SAVEPOINT ${savepoint}`);
              continue;
            }
          }

          await client.query(
            `INSERT INTO products (
               name, reference_code, internal_code, category_id,
               base_sale_price, production_cost, margin_percent, barcode, unit, status
             )
             VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, 'und', 'active')`,
            [
              name,
              referenceCode,
              referenceCode,
              categoryId,
              baseSalePrice,
              productionCost,
              marginPercent,
              barcode,
            ]
          );
          imported++;
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (err: unknown) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          const pgErr = err as { code?: string };
          if (pgErr.code === "23505") {
            duplicates++;
          } else {
            throw err;
          }
        }
      }

      await client.query("COMMIT");
      res.status(201).json({ success: true, imported, updated, duplicates });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  });

  r.get("/documents/by-invoice/:invoiceNumber", requireAuth, requireWarehouse, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    const invoiceNumber = String(req.params.invoiceNumber || "").trim();
    const entryTypeRaw = typeof req.query.entryType === "string" ? req.query.entryType : null;
    const linkedTypes: LinkedEntryType[] = ["distribution", "transfer", "return_to_factory"];
    try {
      if (entryTypeRaw && linkedTypes.includes(entryTypeRaw as LinkedEntryType)) {
        const origin = await lookupOriginExitForEntry(pool, {
          invoiceNumber,
          entryType: entryTypeRaw as LinkedEntryType,
          receivingWarehouseId: req.warehouseId!,
        });
        if (origin.alreadyReceived) {
          res.status(409).json({ error: "origin_invoice_already_received" });
          return;
        }
        const item = await getDocument(pool, auth, origin.documentId, origin.warehouseId);
        if (!item) {
          res.status(404).json({ error: "document_not_found" });
          return;
        }
        res.json({
          item,
          origin: {
            exitKind: origin.exitKind,
            destinationWarehouseId: origin.destinationWarehouseId,
            alreadyReceived: origin.alreadyReceived,
          },
        });
        return;
      }

      const { rows: docRows } = await pool.query<{ id: string; warehouse_id: string }>(
        `SELECT id::text, warehouse_id::text
         FROM inventory_documents
         WHERE upper(replace(invoice_number, ' ', '')) = upper(replace($1, ' ', ''))
         LIMIT 1`,
        [invoiceNumber]
      );
      const doc = docRows[0];
      if (!doc) {
        res.status(404).json({ error: "document_not_found" });
        return;
      }
      const item = await getDocument(pool, auth, doc.id, doc.warehouse_id);
      res.json({ item });
    } catch (err: unknown) {
      const e = err as { code?: string };
      const codes = new Set([
        "origin_invoice_required",
        "origin_invoice_not_found",
        "origin_invoice_wrong_type",
        "origin_invoice_missing_destination",
        "origin_invoice_wrong_destination",
        "origin_invoice_already_received",
      ]);
      if (e?.code && codes.has(e.code)) {
        res.status(e.code === "origin_invoice_already_received" ? 409 : 400).json({ error: e.code });
        return;
      }
      next(err);
    }
  });

  r.get("/customers", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    try {
      let queryStr = `SELECT id::text, display_name AS "displayName", tax_id AS "taxId", phone, address, COALESCE(credit_balance, 0)::float AS "creditBalance" FROM customers`;
      const params: any[] = [];
      if (q) {
        queryStr += ` WHERE display_name ILIKE $1 OR tax_id ILIKE $1 OR phone ILIKE $1`;
        params.push(`%${q}%`);
      }
      queryStr += ` ORDER BY display_name LIMIT 50`;
      const { rows } = await pool.query(queryStr, params);
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  r.post("/customers", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const { displayName, taxId, phone, address } = req.body;
    if (!displayName?.trim()) {
      res.status(400).json({ error: "displayName_required" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO customers (display_name, tax_id, phone, address)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text, display_name AS "displayName", tax_id AS "taxId", phone, address, COALESCE(credit_balance, 0)::float AS "creditBalance"`,
        [displayName.trim(), taxId?.trim() || null, phone?.trim() || null, address?.trim() || null]
      );
      res.status(201).json({ item: rows[0] });
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ error: "customer_already_exists" });
        return;
      }
      next(err);
    }
  });

  // ─── Conteo físico / inventario inicial ─────────────────────────────────

  r.get("/counts", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const status =
      statusRaw === "open" || statusRaw === "completed" || statusRaw === "cancelled"
        ? (statusRaw as CountStatus)
        : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    try {
      const result = await listCounts(pool, req.auth!, {
        warehouseId: req.warehouseId!,
        status,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.get("/counts/open", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    try {
      const item = await getOpenCount(pool, req.auth!, req.warehouseId!);
      if (!item) {
        res.status(404).json({ error: "count_not_open" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  r.get("/counts/:id", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const item = await getCount(pool, req.auth!, id, req.warehouseId!);
      if (!item) {
        res.status(404).json({ error: "count_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  r.post("/counts", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawKind = typeof req.body?.countKind === "string" ? req.body.countKind.trim() : "audit";
    const countKind: CountKind = rawKind === "initial" ? "initial" : "audit";
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    try {
      const item = await openCount(pool, req.auth!, req.warehouseId!, countKind, notes);
      res.status(201).json({ item });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "count_already_open") {
        res.status(409).json({
          error: "count_already_open",
          countId: (err as { countId?: string }).countId,
        });
        return;
      }
      if (code === "initial_count_requires_admin") {
        res.status(403).json({ error: code });
        return;
      }
      if (code === "no_active_products" || code === "warehouse_not_found") {
        res.status(400).json({ error: code });
        return;
      }
      next(err);
    }
  });

  r.patch("/counts/:id/lines", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const productId =
      typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
    if (!isUuid(productId)) {
      res.status(400).json({ error: "invalid_product_id" });
      return;
    }
    const hasQty = req.body?.countedQuantity != null && req.body.countedQuantity !== "";
    const hasDelta = req.body?.delta != null && req.body.delta !== "";
    if (!hasQty && !hasDelta) {
      res.status(400).json({ error: "quantity_or_delta_required" });
      return;
    }
    const countedQuantity = hasQty ? Number(req.body.countedQuantity) : undefined;
    const delta = hasDelta ? Number(req.body.delta) : undefined;
    if (hasQty && (!Number.isFinite(countedQuantity) || (countedQuantity as number) < 0)) {
      res.status(400).json({ error: "invalid_quantity" });
      return;
    }
    if (hasDelta && !Number.isFinite(delta)) {
      res.status(400).json({ error: "invalid_delta" });
      return;
    }
    try {
      const item = await updateCountLine(pool, req.auth!, id, {
        productId,
        countedQuantity,
        delta,
      });
      res.json({ item });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (
        code === "count_not_found" ||
        code === "count_not_open" ||
        code === "product_not_found" ||
        code === "invalid_quantity" ||
        code === "warehouse_forbidden" ||
        code === "initial_count_requires_admin"
      ) {
        res.status(
          code === "warehouse_forbidden" || code === "initial_count_requires_admin"
            ? 403
            : code === "count_not_found"
              ? 404
              : 400
        ).json({
          error: code,
        });
        return;
      }
      next(err);
    }
  });

  r.post("/counts/:id/reset-counted", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const item = await resetCountedQuantities(pool, req.auth!, id);
      res.json({ item });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (
        code === "count_not_found" ||
        code === "count_not_open" ||
        code === "warehouse_forbidden" ||
        code === "initial_count_requires_admin"
      ) {
        res.status(
          code === "warehouse_forbidden" || code === "initial_count_requires_admin"
            ? 403
            : code === "count_not_found"
              ? 404
              : 400
        ).json({
          error: code,
        });
        return;
      }
      next(err);
    }
  });

  r.post("/counts/:id/cancel", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const item = await cancelCount(pool, req.auth!, id);
      res.json({ item });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (
        code === "count_not_found" ||
        code === "count_not_open" ||
        code === "warehouse_forbidden" ||
        code === "initial_count_requires_admin"
      ) {
        res.status(
          code === "warehouse_forbidden" || code === "initial_count_requires_admin"
            ? 403
            : code === "count_not_found"
              ? 404
              : 400
        ).json({
          error: code,
        });
        return;
      }
      next(err);
    }
  });

  r.post("/counts/:id/confirm", requireWarehouse, manageInventory, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = firstPathParam(req.params.id);
    if (!id || !isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    try {
      const item = await confirmCount(pool, req.auth!, id, notes);
      res.json({ item });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (
        code === "count_not_found" ||
        code === "count_not_open" ||
        code === "warehouse_forbidden" ||
        code === "initial_count_requires_admin"
      ) {
        res.status(
          code === "warehouse_forbidden" || code === "initial_count_requires_admin"
            ? 403
            : code === "count_not_found"
              ? 404
              : 400
        ).json({
          error: code,
        });
        return;
      }
      next(err);
    }
  });

  return r;
}
