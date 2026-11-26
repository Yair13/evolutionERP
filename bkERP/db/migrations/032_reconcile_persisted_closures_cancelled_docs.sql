-- 032_reconcile_persisted_closures_cancelled_docs.sql
-- Recalcula los totales guardados en cierres diarios (daily_closures) y cierres contables generales (global_closures)
-- para que solo sumen documentos vigentes (status = 'completed') y excluyan cualquier factura que haya sido anulada después de emitir un cierre.

-- 1. Actualizar cash_sales, expected_cash y cash_difference en daily_closures
WITH dc_recalc AS (
  SELECT
    dc.id,
    COALESCE((
      SELECT ROUND(SUM((p->>'amount')::numeric), 2)
      FROM inventory_documents d,
      LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array'
          THEN d.metadata->'paymentBreakdown'
          ELSE '[]'::jsonb
        END
      ) AS p
      WHERE d.status = 'completed'
        AND d.doc_type IN ('exit', 'sale', 'warranty')
        AND d.warehouse_id = dc.warehouse_id
        AND (dc.started_at IS NULL OR COALESCE(d.completed_at, d.created_at) > dc.started_at)
        AND COALESCE(d.completed_at, d.created_at) <= COALESCE(dc.closed_at, dc.created_at)
        AND LOWER(TRIM(p->>'method')) = 'efectivo'
    ), 0) AS new_cash_sales
  FROM daily_closures dc
  WHERE dc.status <> 'voided'
)
UPDATE daily_closures dc
SET
  expected_cash = ROUND((dc.expected_cash - dc.cash_sales + r.new_cash_sales)::numeric, 2),
  cash_difference = ROUND((dc.counted_cash - (dc.expected_cash - dc.cash_sales + r.new_cash_sales))::numeric, 2),
  cash_sales = r.new_cash_sales
FROM dc_recalc r
WHERE dc.id = r.id
  AND dc.cash_sales <> r.new_cash_sales;

-- 2. Actualizar total_sales, total_cash_sales, total_bank_sales, total_net_cash y cash_to_withdraw en global_closures
WITH gc_recalc AS (
  SELECT
    gc.id,
    COALESCE((
      SELECT ROUND(SUM((p->>'amount')::numeric), 2)
      FROM inventory_documents d,
      LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array'
          THEN d.metadata->'paymentBreakdown'
          ELSE '[]'::jsonb
        END
      ) AS p
      WHERE d.status = 'completed'
        AND d.doc_type IN ('exit', 'sale', 'warranty')
        AND (gc.warehouse_id IS NULL OR d.warehouse_id = gc.warehouse_id)
        AND (COALESCE(d.completed_at, d.created_at) AT TIME ZONE 'America/Bogota')::date BETWEEN gc.date_from AND gc.date_to
        AND COALESCE(d.completed_at, d.created_at) <= COALESCE(gc.closed_at, gc.created_at)
    ), 0) AS new_total_sales,
    COALESCE((
      SELECT ROUND(SUM((p->>'amount')::numeric), 2)
      FROM inventory_documents d,
      LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array'
          THEN d.metadata->'paymentBreakdown'
          ELSE '[]'::jsonb
        END
      ) AS p
      WHERE d.status = 'completed'
        AND d.doc_type IN ('exit', 'sale', 'warranty')
        AND (gc.warehouse_id IS NULL OR d.warehouse_id = gc.warehouse_id)
        AND (COALESCE(d.completed_at, d.created_at) AT TIME ZONE 'America/Bogota')::date BETWEEN gc.date_from AND gc.date_to
        AND COALESCE(d.completed_at, d.created_at) <= COALESCE(gc.closed_at, gc.created_at)
        AND LOWER(TRIM(p->>'method')) = 'efectivo'
    ), 0) AS new_cash_sales
  FROM global_closures gc
)
UPDATE global_closures gc
SET
  total_net_cash = ROUND((gc.total_net_cash - gc.total_cash_sales + r.new_cash_sales)::numeric, 2),
  cash_to_withdraw = GREATEST(0, ROUND(((COALESCE(gc.opening_cash, 0) + (gc.total_net_cash - gc.total_cash_sales + r.new_cash_sales)) - gc.cash_to_keep)::numeric, 2)),
  total_sales = r.new_total_sales,
  total_cash_sales = r.new_cash_sales,
  total_bank_sales = GREATEST(0, ROUND((r.new_total_sales - r.new_cash_sales)::numeric, 2))
FROM gc_recalc r
WHERE gc.id = r.id
  AND (gc.total_sales <> r.new_total_sales OR gc.total_cash_sales <> r.new_cash_sales);
