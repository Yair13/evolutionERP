import type pg from "pg";
import { getTodayBogotaYmd, getDaysAgoBogotaYmd } from "../../lib/date-utils.js";

export type UtilitiesPeriod = {
  revenue: number;
  cost: number;
  expenses: number;
  profit: number;
  salesUnits: number;
  documentCount: number;
};

export type UtilitiesProductRow = {
  productId: string;
  name: string;
  referenceCode: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  units: number;
};

export type UtilitiesSummary = {
  generatedAt: string;
  warehouseId: string | null;
  today: UtilitiesPeriod;
  month: UtilitiesPeriod;
  profitTrend: { date: string; profit: number; revenue: number }[];
  topProfitable: UtilitiesProductRow[];
  lowMargin: UtilitiesProductRow[];
};

function scopeWarehouse(warehouseId: string | null, alias: string, params: unknown[]): string {
  if (!warehouseId) return "TRUE";
  params.push(warehouseId);
  return `${alias}.warehouse_id = $${params.length}::uuid`;
}

async function periodMetrics(
  pool: pg.Pool,
  warehouseId: string | null,
  dateFrom: string,
  dateTo: string
): Promise<UtilitiesPeriod> {
  const params: unknown[] = [dateFrom, dateTo];
  const whDoc = scopeWarehouse(warehouseId, "d", params);
  const whExp = scopeWarehouse(warehouseId, "e", params);

  const { rows: salesRows } = await pool.query<{
    revenue: string;
    cost: string;
    units: string;
    docs: string;
  }>(
    `
    SELECT
      COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0)::text AS revenue,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_cost, 0)), 0)::text AS cost,
      COALESCE(SUM(l.quantity), 0)::text AS units,
      COUNT(DISTINCT d.id)::text AS docs
    FROM inventory_documents d
    JOIN inventory_document_lines l ON l.document_id = d.id
    WHERE d.doc_type = 'exit'
      AND d.status = 'completed'
      AND d.completed_at::date >= $1::date
      AND d.completed_at::date <= $2::date
      AND (${whDoc})
    `,
    params
  );

  const expParams = warehouseId ? [dateFrom, dateTo, warehouseId] : [dateFrom, dateTo];
  const { rows: expRows } = await pool.query<{ total: string }>(
    `
    SELECT COALESCE(SUM(e.amount), 0)::text AS total
    FROM expenses e
    WHERE e.expense_date >= $1::date
      AND e.expense_date <= $2::date
      AND (${whExp})
    `,
    expParams
  );

  const revenue = Number(salesRows[0]?.revenue ?? 0);
  const cost = Number(salesRows[0]?.cost ?? 0);
  const expenses = Number(expRows[0]?.total ?? 0);
  const profit = revenue - cost - expenses;

  return {
    revenue,
    cost,
    expenses,
    profit,
    salesUnits: Number(salesRows[0]?.units ?? 0),
    documentCount: Number(salesRows[0]?.docs ?? 0),
  };
}

async function productRanking(
  pool: pg.Pool,
  warehouseId: string | null,
  order: "desc" | "asc",
  limit: number
): Promise<UtilitiesProductRow[]> {
  const params: unknown[] = [];
  const whDoc = scopeWarehouse(warehouseId, "d", params);
  params.push(limit);

  const { rows } = await pool.query<{
    product_id: string;
    name: string;
    reference_code: string;
    revenue: string;
    cost: string;
    units: string;
  }>(
    `
    SELECT
      p.id::text AS product_id,
      p.name,
      p.reference_code,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0)::text AS revenue,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_cost, 0)), 0)::text AS cost,
      COALESCE(SUM(l.quantity), 0)::text AS units
    FROM inventory_documents d
    JOIN inventory_document_lines l ON l.document_id = d.id
    JOIN products p ON p.id = l.product_id
    WHERE d.doc_type = 'exit'
      AND d.status = 'completed'
      AND d.completed_at >= (CURRENT_DATE - INTERVAL '30 days')
      AND (${whDoc})
    GROUP BY p.id, p.name, p.reference_code
    HAVING COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0) > 0
    ORDER BY (COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0)
              - COALESCE(SUM(l.quantity * COALESCE(l.unit_cost, 0)), 0)) ${order === "desc" ? "DESC" : "ASC"}
    LIMIT $${params.length}
    `,
    params
  );

  return rows.map((r) => {
    const revenue = Number(r.revenue);
    const cost = Number(r.cost);
    const profit = revenue - cost;
    return {
      productId: r.product_id,
      name: r.name,
      referenceCode: r.reference_code,
      revenue,
      cost,
      profit,
      marginPercent: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : null,
      units: Number(r.units),
    };
  });
}

export async function getUtilitiesSummary(
  pool: pg.Pool,
  warehouseId: string | null
): Promise<UtilitiesSummary> {
  const todayStr = getTodayBogotaYmd();
  const monthStart = `${todayStr.slice(0, 8)}01`;

  const [today, month, topProfitable, lowMargin] = await Promise.all([
    periodMetrics(pool, warehouseId, todayStr, todayStr),
    periodMetrics(pool, warehouseId, monthStart, todayStr),
    productRanking(pool, warehouseId, "desc", 6),
    productRanking(pool, warehouseId, "asc", 5),
  ]);

  const trendParams: unknown[] = [];
  const whDoc = scopeWarehouse(warehouseId, "d", trendParams);

  const { rows: trendSales } = await pool.query<{ d: string; revenue: string; cost: string }>(
    `
    SELECT
      d.completed_at::date::text AS d,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_sale_price, 0)), 0)::text AS revenue,
      COALESCE(SUM(l.quantity * COALESCE(l.unit_cost, 0)), 0)::text AS cost
    FROM inventory_documents d
    JOIN inventory_document_lines l ON l.document_id = d.id
    WHERE d.doc_type = 'exit'
      AND d.status = 'completed'
      AND d.completed_at >= (CURRENT_DATE - INTERVAL '13 days')
      AND (${whDoc})
    GROUP BY 1
    ORDER BY 1
    `,
    trendParams
  );

  const expTrendParams: unknown[] = [];
  const whExp = scopeWarehouse(warehouseId, "e", expTrendParams);
  const { rows: trendExp } = await pool.query<{ d: string; total: string }>(
    `
    SELECT e.expense_date::text AS d, COALESCE(SUM(e.amount), 0)::text AS total
    FROM expenses e
    WHERE e.expense_date >= (CURRENT_DATE - INTERVAL '13 days')
      AND (${whExp})
    GROUP BY 1
    `,
    expTrendParams
  );

  const salesMap = new Map(trendSales.map((r) => [r.d, { revenue: Number(r.revenue), cost: Number(r.cost) }]));
  const expMap = new Map(trendExp.map((r) => [r.d, Number(r.total)]));

  const profitTrend: UtilitiesSummary["profitTrend"] = [];
  for (let i = 13; i >= 0; i--) {
    const key = getDaysAgoBogotaYmd(i);
    const s = salesMap.get(key);
    const revenue = s?.revenue ?? 0;
    const cost = s?.cost ?? 0;
    const expenses = expMap.get(key) ?? 0;
    profitTrend.push({
      date: key,
      revenue,
      profit: revenue - cost - expenses,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    warehouseId,
    today,
    month,
    profitTrend,
    topProfitable,
    lowMargin,
  };
}
