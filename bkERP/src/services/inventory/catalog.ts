import type pg from "pg";
import {
  SQL_PICK_CATALOG_IMAGE,
  SQL_PICK_CATALOG_IMAGE_LG,
  sqlProductImageSubselect,
} from "../../lib/image-variants.js";
import { canSeeProductionCost } from "../../lib/inventory-permissions.js";
import type { AuthContext } from "../auth-context.js";
import type { CatalogItem, StockSignal } from "./types.js";

export type CatalogRow = {
  id: string;
  reference_code: string;
  sku: string | null;
  internal_code: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string;
  status: string;
  category_id: string | null;
  category_name: string | null;
  base_sale_price: string;
  production_cost: string;
  margin_percent: string | null;
  barcode: string | null;
  image_url: string | null;
  image_url_lg: string | null;
  quantity_on_hand: string | null;
  min_stock_level: string | null;
  critical_stock_level: string | null;
  stock_signal: StockSignal | null;
  semaphore_configured: boolean;
  is_active: boolean;
};

export function mapRow(
  row: CatalogRow,
  includeCost: boolean,
  opts?: { includeStock?: boolean }
): CatalogItem {
  const includeStock = opts?.includeStock !== false;
  const qty = includeStock && row.quantity_on_hand != null ? Number(row.quantity_on_hand) : 0;
  const item: CatalogItem = {
    id: row.id,
    referenceCode: row.reference_code,
    sku: row.sku,
    internalCode: row.internal_code,
    name: row.name,
    description: row.description,
    brand: row.brand,
    unit: row.unit,
    status: row.status,
    categoryId: row.category_id,
    categoryName: row.category_name,
    baseSalePrice: Number(row.base_sale_price),
    marginPercent: row.margin_percent != null ? Number(row.margin_percent) : null,
    barcode: row.barcode,
    imageUrl: row.image_url,
    imageUrlLg: row.image_url_lg ?? row.image_url,
    quantityOnHand: qty,
    minStockLevel:
      includeStock && row.min_stock_level != null ? Number(row.min_stock_level) : 0,
    criticalStockLevel:
      includeStock && row.critical_stock_level != null
        ? Number(row.critical_stock_level)
        : 0,
    stockSignal: includeStock
      ? (row.stock_signal ?? (qty <= 0 ? "out" : "ok"))
      : "ok",
    semaphoreConfigured: includeStock && row.semaphore_configured === true,
    isActive: row.is_active,
  };
  if (includeCost) {
    item.productionCost = Number(row.production_cost);
  }
  return item;
}

export type CatalogQuery = {
  warehouseId: string;
  q?: string;
  categoryId?: string;
  status?: string;
  /** Solo productos sin código de barras (buscables por clic en salida). */
  withoutBarcode?: boolean;
  /** Solo productos con código de barras (orden de producción / etiquetas). */
  withBarcode?: boolean;
  limit?: number;
  offset?: number;
};

export type ProductCatalogQuery = {
  q?: string;
  categoryId?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export async function listCatalog(
  pool: pg.Pool,
  auth: AuthContext,
  query: CatalogQuery
): Promise<{ items: CatalogItem[]; total: number }> {
  const includeCost = canSeeProductionCost(auth);
  const limit = Math.min(Math.max(query.limit ?? 48, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);

  const conditions: string[] = ["p.is_active = true"];
  const filterParams: unknown[] = [];
  let filterIdx = 1;

  if (query.q?.trim()) {
    const tokens = query.q.trim().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      conditions.push(
        `(p.name ILIKE $${filterIdx} OR p.reference_code ILIKE $${filterIdx} OR COALESCE(p.barcode, '') ILIKE $${filterIdx} OR COALESCE(p.sku, '') ILIKE $${filterIdx} OR COALESCE(p.internal_code, '') ILIKE $${filterIdx})`
      );
      filterParams.push(`%${token}%`);
      filterIdx++;
    }
  }
  if (query.categoryId && /^[0-9a-f-]{36}$/i.test(query.categoryId)) {
    conditions.push(`p.category_id = $${filterIdx}::uuid`);
    filterParams.push(query.categoryId);
    filterIdx++;
  }
  if (query.status) {
    conditions.push(`p.status = $${filterIdx}`);
    filterParams.push(query.status);
    filterIdx++;
  }
  if (query.withoutBarcode) {
    conditions.push(`(p.barcode IS NULL OR p.barcode = '')`);
  }
  if (query.withBarcode) {
    conditions.push(`(p.barcode IS NOT NULL AND p.barcode <> '')`);
  }

  const where = conditions.join(" AND ");

  const countSql = `
    SELECT COUNT(*)::text AS c
    FROM products p
    WHERE ${where}
  `;
  const { rows: countRows } = await pool.query<{ c: string }>(countSql, filterParams);
  const total = Number(countRows[0]?.c ?? 0);

  const listWhere = conditions
    .map((c) => {
      return c.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`);
    })
    .join(" AND ");

  const limitIdx = filterParams.length + 2;
  const offsetIdx = limitIdx + 1;
  const listParams = [query.warehouseId, ...filterParams, limit, offset];

  const sql = `
    SELECT
      p.id::text,
      p.reference_code,
      p.sku,
      p.internal_code,
      p.name,
      p.description,
      p.brand,
      p.unit,
      p.status,
      p.category_id::text,
      c.name AS category_name,
      COALESCE(wps_sem.sale_price, p.base_sale_price)::text AS base_sale_price,
      p.production_cost::text,
      p.margin_percent::text,
      p.barcode,
      ${sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE)} AS image_url,
      ${sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE_LG)} AS image_url_lg,
      cs.quantity_on_hand::text,
      COALESCE(cs.min_stock_level, wps_sem.min_stock_level)::text AS min_stock_level,
      COALESCE(cs.critical_stock_level, wps_sem.critical_stock_level)::text AS critical_stock_level,
      cs.stock_signal,
      (wps_sem.product_id IS NOT NULL) AS semaphore_configured,
      p.is_active
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN v_catalog_stock cs
      ON cs.product_id = p.id AND cs.warehouse_id = $1::uuid
    LEFT JOIN warehouse_product_settings wps_sem
      ON wps_sem.warehouse_id = $1::uuid AND wps_sem.product_id = p.id
    WHERE ${listWhere}
    ORDER BY p.name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query<CatalogRow>(sql, listParams);
  return {
    items: rows.map((r) => mapRow(r, includeCost, { includeStock: true })),
    total,
  };
}

/** Catálogo maestro (empresa): sin stock ni semáforo por sede. */
export async function listProductCatalog(
  pool: pg.Pool,
  auth: AuthContext,
  query: ProductCatalogQuery
): Promise<{ items: CatalogItem[]; total: number }> {
  const includeCost = canSeeProductionCost(auth);
  const limit = Math.min(Math.max(query.limit ?? 48, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);

  const conditions: string[] = ["p.is_active = true"];
  const params: unknown[] = [];
  let idx = 1;

  if (query.q?.trim()) {
    const tokens = query.q.trim().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      conditions.push(
        `(p.name ILIKE $${idx} OR p.reference_code ILIKE $${idx} OR COALESCE(p.barcode, '') ILIKE $${idx} OR COALESCE(p.sku, '') ILIKE $${idx} OR COALESCE(p.internal_code, '') ILIKE $${idx})`
      );
      params.push(`%${token}%`);
      idx++;
    }
  }
  if (query.categoryId && /^[0-9a-f-]{36}$/i.test(query.categoryId)) {
    conditions.push(`p.category_id = $${idx}::uuid`);
    params.push(query.categoryId);
    idx++;
  }
  if (query.status) {
    conditions.push(`p.status = $${idx}`);
    params.push(query.status);
    idx++;
  }

  const where = conditions.join(" AND ");

  const { rows: countRows } = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM products p WHERE ${where}`,
    params
  );
  const total = Number(countRows[0]?.c ?? 0);

  const limitIdx = idx;
  const offsetIdx = idx + 1;
  params.push(limit, offset);

  const sql = `
    SELECT
      p.id::text,
      p.reference_code,
      p.sku,
      p.internal_code,
      p.name,
      p.description,
      p.brand,
      p.unit,
      p.status,
      p.category_id::text,
      c.name AS category_name,
      p.base_sale_price::text,
      p.production_cost::text,
      p.margin_percent::text,
      p.barcode,
      ${sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE)} AS image_url,
      ${sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE_LG)} AS image_url_lg,
      NULL::text AS quantity_on_hand,
      NULL::text AS min_stock_level,
      NULL::text AS critical_stock_level,
      NULL::text AS stock_signal,
      false AS semaphore_configured,
      p.is_active
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    WHERE ${where}
    ORDER BY p.name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query<CatalogRow>(sql, params);
  return {
    items: rows.map((r) => mapRow(r, includeCost, { includeStock: false })),
    total,
  };
}

export async function findProductByScan(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string,
  code: string
): Promise<CatalogItem | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { rows } = await pool.query<CatalogRow>(
    `
    SELECT
      p.id::text,
      p.reference_code,
      p.sku,
      p.internal_code,
      p.name,
      p.description,
      p.brand,
      p.unit,
      p.status,
      p.category_id::text,
      c.name AS category_name,
      COALESCE(wps_sem.sale_price, p.base_sale_price)::text AS base_sale_price,
      p.production_cost::text,
      p.margin_percent::text,
      p.barcode,
      ${sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE)} AS image_url,
      ${sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE_LG)} AS image_url_lg,
      cs.quantity_on_hand::text,
      COALESCE(cs.min_stock_level, wps_sem.min_stock_level)::text AS min_stock_level,
      COALESCE(cs.critical_stock_level, wps_sem.critical_stock_level)::text AS critical_stock_level,
      cs.stock_signal,
      (wps_sem.product_id IS NOT NULL) AS semaphore_configured,
      p.is_active
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN v_catalog_stock cs
      ON cs.product_id = p.id AND cs.warehouse_id = $1::uuid
    LEFT JOIN warehouse_product_settings wps_sem
      ON wps_sem.warehouse_id = $1::uuid AND wps_sem.product_id = p.id
    WHERE p.is_active = true
      AND (
        p.barcode = $2
        OR p.reference_code = $2
        OR p.sku = $2
        OR p.internal_code = $2
      )
    LIMIT 1
    `,
    [warehouseId, trimmed]
  );

  const row = rows[0];
  if (!row) return null;
  return mapRow(row, canSeeProductionCost(auth));
}
