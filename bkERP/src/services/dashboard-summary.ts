import type pg from "pg";

export type AuthForScope = {
  warehouseIds: string[] | null;
};

export type DashboardSummary = {
  generatedAt: string;
  scope: "all" | "warehouses";
  kpis: {
    activeWarehouses: number;
    activeProducts: number;
    movementsToday: number;
    movementsLast7Days: number;
    stockLocationsTracked: number;
    attentionLowStock: number;
  };
  movementTrend: { date: string; count: number }[];
  recentMovements: {
    id: string;
    at: string;
    type: string;
    quantity: string;
    productRef: string;
    productName: string;
    warehouseCode: string;
    warehouseName: string;
  }[];
  snapshotWarehouses: { id: string; code: string; name: string }[];
};

function scopeClause(alias: string, auth: AuthForScope): { sql: string; params: unknown[] } {
  if (auth.warehouseIds === null) {
    return { sql: "TRUE", params: [] };
  }
  if (auth.warehouseIds.length === 0) {
    return { sql: "FALSE", params: [] };
  }
  return { sql: `${alias}.warehouse_id = ANY($1::uuid[])`, params: [auth.warehouseIds] };
}

function lastNDates(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

export async function getDashboardSummary(pool: pg.Pool, auth: AuthForScope): Promise<DashboardSummary> {
  const generatedAt = new Date().toISOString();
  const unrestricted = auth.warehouseIds === null;
  const scope: DashboardSummary["scope"] = unrestricted ? "all" : "warehouses";
  const empty: DashboardSummary = {
    generatedAt,
    scope,
    kpis: {
      activeWarehouses: 0,
      activeProducts: 0,
      movementsToday: 0,
      movementsLast7Days: 0,
      stockLocationsTracked: 0,
      attentionLowStock: 0,
    },
    movementTrend: lastNDates(7).map((date) => ({ date, count: 0 })),
    recentMovements: [],
    snapshotWarehouses: [],
  };

  if (!unrestricted && auth.warehouseIds!.length === 0) {
    return empty;
  }

  const wh = scopeClause("w", auth);
  const sm = scopeClause("sm", auth);
  const v = scopeClause("v", auth);

  const [{ rows: whCountRows }, { rows: prodRows }, { rows: snapRows }] = await Promise.all([
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
       FROM warehouses w
       WHERE w.is_active = true AND (${wh.sql})`,
      wh.params
    ),
    pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM products WHERE is_active = true`),
    pool.query<{ id: string; code: string; name: string }>(
      `SELECT w.id::text, w.code, w.name
       FROM warehouses w
       WHERE w.is_active = true AND (${wh.sql})
       ORDER BY w.name
       LIMIT 6`,
      wh.params
    ),
  ]);

  const [{ rows: movToday }, { rows: mov7 }, { rows: stockLoc }, { rows: lowStock }, { rows: trendRows }, { rows: recentRows }] =
    await Promise.all([
      pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM stock_movements sm
         WHERE (${sm.sql})
           AND sm.created_at >= CURRENT_DATE`,
        sm.params
      ),
      pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM stock_movements sm
         WHERE (${sm.sql})
           AND sm.created_at >= (CURRENT_DATE - INTERVAL '6 days')`,
        sm.params
      ),
      pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM v_warehouse_product_stock v
         WHERE (${v.sql})
           AND v.quantity_on_hand <> 0`,
        v.params
      ),
      pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM v_warehouse_product_stock v
         INNER JOIN warehouse_product_settings wps
           ON wps.warehouse_id = v.warehouse_id AND wps.product_id = v.product_id
         WHERE (${v.sql})
           AND wps.critical_stock_level > 0
           AND v.quantity_on_hand <= wps.critical_stock_level`,
        v.params
      ),
      pool.query<{ d: string; c: number }>(
        `SELECT sm.created_at::date::text AS d, COUNT(*)::int AS c
         FROM stock_movements sm
         WHERE (${sm.sql})
           AND sm.created_at >= (CURRENT_DATE - INTERVAL '6 days')
         GROUP BY 1
         ORDER BY 1`,
        sm.params
      ),
      pool.query<{
        id: string;
        at: Date;
        type: string;
        quantity: string;
        product_ref: string;
        product_name: string;
        warehouse_code: string;
        warehouse_name: string;
      }>(
        `SELECT sm.id::text,
                sm.created_at AS at,
                sm.movement_type AS type,
                sm.quantity::text,
                p.reference_code AS product_ref,
                p.name AS product_name,
                w.code AS warehouse_code,
                w.name AS warehouse_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id
         WHERE (${sm.sql})
         ORDER BY sm.created_at DESC
         LIMIT 8`,
        sm.params
      ),
    ]);

  const trendMap = new Map<string, number>();
  for (const r of trendRows) trendMap.set(r.d, r.c);

  const dates = lastNDates(7);
  const movementTrend = dates.map((date) => ({ date, count: trendMap.get(date) ?? 0 }));

  return {
    generatedAt,
    scope,
    kpis: {
      activeWarehouses: whCountRows[0]?.c ?? 0,
      activeProducts: prodRows[0]?.c ?? 0,
      movementsToday: movToday[0]?.c ?? 0,
      movementsLast7Days: mov7[0]?.c ?? 0,
      stockLocationsTracked: stockLoc[0]?.c ?? 0,
      attentionLowStock: lowStock[0]?.c ?? 0,
    },
    movementTrend,
    recentMovements: recentRows.map((r) => ({
      id: r.id,
      at: new Date(r.at).toISOString(),
      type: r.type,
      quantity: r.quantity,
      productRef: r.product_ref,
      productName: r.product_name,
      warehouseCode: r.warehouse_code,
      warehouseName: r.warehouse_name,
    })),
    snapshotWarehouses: snapRows,
  };
}
