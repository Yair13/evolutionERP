-- 027_customer_warehouse_credit_balances.sql
-- Control de saldos a favor de clientes discriminados por sede / bodega física.

CREATE TABLE IF NOT EXISTS customer_warehouse_credit_balances (
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  credit_balance numeric(18, 2) NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_wh_credit_cust ON customer_warehouse_credit_balances (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_wh_credit_wh ON customer_warehouse_credit_balances (warehouse_id);

-- Poblar saldos iniciales por sede a partir del historial de abonos y ventas
INSERT INTO customer_warehouse_credit_balances (customer_id, warehouse_id, credit_balance, updated_at)
SELECT
  sub.customer_id,
  sub.warehouse_id,
  GREATEST(0, ROUND(SUM(sub.amount)::numeric, 2)) AS credit_balance,
  now()
FROM (
  -- Excesos en pagos de cartera
  SELECT
    rp.customer_id,
    rp.warehouse_id,
    rp.excess_to_favour AS amount
  FROM receivable_payments rp
  WHERE rp.excess_to_favour > 0

  UNION ALL

  -- Saldo a favor usado en pagos de cartera (resta)
  SELECT
    rp.customer_id,
    rp.warehouse_id,
    -rp.amount AS amount
  FROM receivable_payments rp
  WHERE rp.payment_method = 'saldo_a_favor' AND (rp.notes IS NULL OR rp.notes NOT LIKE 'Abono inicial%')

  UNION ALL

  -- Excesos en ventas de inventario (POS)
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
  WHERE d.customer_id IS NOT NULL
    AND d.status = 'completed'
    AND d.metadata IS NOT NULL
    AND jsonb_typeof(d.metadata) = 'object'
    AND (d.metadata->>'excessToFavour') IS NOT NULL
    AND (d.metadata->>'excessToFavour') ~ '^[0-9]+(\.[0-9]+)?$'
    AND (d.metadata->>'excessToFavour')::numeric > 0

  UNION ALL

  -- Saldo a favor usado en ventas (POS) (resta)
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
    AND elem->>'method' = 'saldo_a_favor'
) sub
WHERE sub.customer_id IS NOT NULL AND sub.warehouse_id IS NOT NULL
GROUP BY sub.customer_id, sub.warehouse_id
HAVING SUM(sub.amount) > 0
ON CONFLICT (customer_id, warehouse_id)
DO UPDATE SET credit_balance = EXCLUDED.credit_balance, updated_at = now();

-- Sincronizar saldo consolidado en tabla principal de clientes
UPDATE customers c
SET credit_balance = COALESCE((
  SELECT SUM(cw.credit_balance)
  FROM customer_warehouse_credit_balances cw
  WHERE cw.customer_id = c.id
), 0);
