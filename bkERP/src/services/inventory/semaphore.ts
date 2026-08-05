import type pg from "pg";
import { canSeeProductionCost } from "../../lib/inventory-permissions.js";
import type { AuthContext } from "../auth-context.js";
import { mapRow, type CatalogRow } from "./catalog.js";
import type { CatalogItem, StockSignal } from "./types.js";

const SIGNAL_CASE_SQL = `
  CASE
    WHEN COALESCE(cs.quantity_on_hand, 0) <= 0 THEN 'out'
    WHEN cs.stock_signal IS NOT NULL THEN cs.stock_signal::text
    ELSE 'ok'
  END
`;

export type StockSemaphoreSummary = {
  ok: number;
  low: number;
  critical: number;
  out: number;
  total: number;
};

export async function getStockSemaphoreSummary(
  pool: pg.Pool,
  warehouseId: string
): Promise<StockSemaphoreSummary> {
  const { rows } = await pool.query<{ signal: string; c: string }>(
    `
    SELECT ${SIGNAL_CASE_SQL} AS signal, COUNT(*)::text AS c
    FROM products p
    LEFT JOIN v_catalog_stock cs
      ON cs.product_id = p.id AND cs.warehouse_id = $1::uuid
    WHERE p.is_active = true
    GROUP BY 1
    `,
    [warehouseId]
  );

  const counts: StockSemaphoreSummary = { ok: 0, low: 0, critical: 0, out: 0, total: 0 };
  for (const row of rows) {
    const n = Number(row.c);
    counts.total += n;
    if (row.signal === "ok") counts.ok = n;
    else if (row.signal === "low") counts.low = n;
    else if (row.signal === "critical") counts.critical = n;
    else if (row.signal === "out") counts.out = n;
  }
  return counts;
}

export type StockSemaphoreQuery = {
  warehouseId: string;
  signal?: StockSignal;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function listStockSemaphore(
  pool: pg.Pool,
  auth: AuthContext,
  query: StockSemaphoreQuery
): Promise<{ items: CatalogItem[]; total: number }> {
  const includeCost = canSeeProductionCost(auth);
  const limit = Math.min(Math.max(query.limit ?? 48, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);

  const conditions: string[] = ["p.is_active = true"];
  const params: unknown[] = [query.warehouseId];
  let idx = 2;

  if (query.signal) {
    conditions.push(`${SIGNAL_CASE_SQL} = $${idx}`);
    params.push(query.signal);
    idx++;
  } else {
    conditions.push(`${SIGNAL_CASE_SQL} <> 'ok'`);
  }

  if (query.q?.trim()) {
    conditions.push(
      `(p.name ILIKE $${idx} OR p.reference_code ILIKE $${idx} OR COALESCE(p.sku, '') ILIKE $${idx} OR COALESCE(p.barcode, '') ILIKE $${idx})`
    );
    params.push(`%${query.q.trim()}%`);
    idx++;
  }

  const where = conditions.join(" AND ");

  const countSql = `
    SELECT COUNT(*)::text AS c
    FROM products p
    LEFT JOIN v_catalog_stock cs
      ON cs.product_id = p.id AND cs.warehouse_id = $1::uuid
    WHERE ${where}
  `;
  const { rows: countRows } = await pool.query<{ c: string }>(countSql, params);
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
      (
        SELECT COALESCE(
          NULLIF(pi.variants->>'md', ''),
          NULLIF(pi.variants->>'sm', ''),
          pi.thumb_url,
          pi.url
        )
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) AS image_url,
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
    WHERE ${where}
    ORDER BY
      CASE ${SIGNAL_CASE_SQL}
        WHEN 'critical' THEN 1
        WHEN 'low' THEN 2
        WHEN 'out' THEN 3
        ELSE 4
      END,
      COALESCE(cs.quantity_on_hand, 0) ASC,
      p.name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query<CatalogRow>(sql, params);
  return {
    items: rows.map((r) => mapRow(r, includeCost)),
    total,
  };
}
