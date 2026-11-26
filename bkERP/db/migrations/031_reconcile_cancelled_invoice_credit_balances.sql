-- 031_reconcile_cancelled_invoice_credit_balances.sql
-- Recalcula los saldos a favor de todos los clientes por sede excluyendo facturas anuladas (status = 'cancelled'),
-- corrigiendo cualquier saldo a favor que haya quedado retenido tras anular una factura con excedente.

-- 1. Poner en 0 todos los saldos por sede antes de recalcular desde los movimientos vigentes
UPDATE customer_warehouse_credit_balances
SET credit_balance = 0,
    updated_at = now();

-- 2. Recalcular el saldo a favor exacto por cliente y sede a partir de movimientos activos/vigentes
INSERT INTO customer_warehouse_credit_balances (customer_id, warehouse_id, credit_balance, updated_at)
SELECT
  sub.customer_id,
  sub.warehouse_id,
  GREATEST(0, ROUND(SUM(sub.amount)::numeric, 2)) AS credit_balance,
  now()
FROM (
  -- A. Excesos a favor generados en abonos de cartera (de créditos no anulados o abonos directos sin factura)
  SELECT
    rp.customer_id,
    rp.warehouse_id,
    rp.excess_to_favour AS amount
  FROM receivable_payments rp
  LEFT JOIN accounts_receivable ar ON ar.id = rp.receivable_id
  LEFT JOIN inventory_documents d ON d.id = ar.document_id
  WHERE rp.excess_to_favour > 0
    AND (ar.id IS NULL OR ar.status <> 'cancelled')
    AND (d.id IS NULL OR d.status <> 'cancelled')

  UNION ALL

  -- B. Saldo a favor consumido en abonos de cartera posteriores
  SELECT
    rp.customer_id,
    rp.warehouse_id,
    -rp.amount AS amount
  FROM receivable_payments rp
  LEFT JOIN accounts_receivable ar ON ar.id = rp.receivable_id
  LEFT JOIN inventory_documents d ON d.id = ar.document_id
  WHERE LOWER(TRIM(rp.payment_method)) = 'saldo_a_favor'
    AND (rp.notes IS NULL OR rp.notes NOT LIKE 'Abono inicial%')
    AND (ar.id IS NULL OR ar.status <> 'cancelled')
    AND (d.id IS NULL OR d.status <> 'cancelled')

  UNION ALL

  -- C. Excesos a favor generados directamente en ventas de contado/cambios completadas (sin fila en accounts_receivable)
  SELECT
    d.customer_id,
    d.warehouse_id,
    COALESCE(
      CASE
        WHEN (d.metadata->>'excessToFavour') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (d.metadata->>'excessToFavour')::numeric
        ELSE 0
      END,
      0
    ) AS amount
  FROM inventory_documents d
  LEFT JOIN accounts_receivable ar ON ar.document_id = d.id
  WHERE d.customer_id IS NOT NULL
    AND d.status = 'completed'
    AND ar.id IS NULL
    AND d.metadata IS NOT NULL
    AND jsonb_typeof(d.metadata) = 'object'
    AND (d.metadata->>'excessToFavour') IS NOT NULL
    AND (d.metadata->>'excessToFavour') ~ '^[0-9]+(\.[0-9]+)?$'
    AND (d.metadata->>'excessToFavour')::numeric > 0

  UNION ALL

  -- D. Saldo a favor consumido en facturas de venta completadas
  SELECT
    d.customer_id,
    d.warehouse_id,
    -COALESCE(
      CASE
        WHEN (elem->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (elem->>'amount')::numeric
        ELSE 0
      END,
      0
    ) AS amount
  FROM inventory_documents d,
  LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array'
      THEN d.metadata->'paymentBreakdown'
      ELSE '[]'::jsonb
    END
  ) AS elem
  WHERE d.customer_id IS NOT NULL
    AND d.status = 'completed'
    AND LOWER(TRIM(elem->>'method')) = 'saldo_a_favor'

  UNION ALL

  -- E. Sobrante a favor generado al redimir un apartado en una venta completada
  SELECT
    l.customer_id,
    l.warehouse_id,
    GREATEST(
      0,
      l.paid_amount - COALESCE(
        CASE
          WHEN (d.metadata->>'totalAmount') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (d.metadata->>'totalAmount')::numeric
          ELSE l.paid_amount
        END,
        l.paid_amount
      )
    ) AS amount
  FROM layaways l
  JOIN inventory_documents d ON d.id = l.resulting_document_id
  WHERE l.status = 'completed'
    AND d.status = 'completed'
    AND l.paid_amount > COALESCE(
      CASE
        WHEN (d.metadata->>'totalAmount') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (d.metadata->>'totalAmount')::numeric
        ELSE l.paid_amount
      END,
      l.paid_amount
    )

  UNION ALL

  -- F. Saldo a favor consumido en abonos activos de apartados activos o completados
  SELECT
    lp.customer_id,
    lp.warehouse_id,
    -lp.amount AS amount
  FROM layaway_payments lp
  JOIN layaways l ON l.id = lp.layaway_id
  WHERE LOWER(TRIM(lp.payment_method)) = 'saldo_a_favor'
    AND COALESCE(lp.status, 'active') = 'active'
    AND l.status IN ('active', 'completed')
) sub
WHERE sub.customer_id IS NOT NULL
  AND sub.warehouse_id IS NOT NULL
GROUP BY sub.customer_id, sub.warehouse_id
HAVING ROUND(SUM(sub.amount)::numeric, 2) > 0
ON CONFLICT (customer_id, warehouse_id)
DO UPDATE SET
  credit_balance = EXCLUDED.credit_balance,
  updated_at = now();

-- 3. Sincronizar el saldo a favor consolidado en la tabla customers
UPDATE customers c
SET credit_balance = COALESCE((
  SELECT SUM(cw.credit_balance)
  FROM customer_warehouse_credit_balances cw
  WHERE cw.customer_id = c.id
), 0);
