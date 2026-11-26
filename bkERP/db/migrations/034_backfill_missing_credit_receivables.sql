-- 034_backfill_missing_credit_receivables.sql
-- Reconcilia documentos de salida completados con exit_kind = 'credit' que no tenían fila en accounts_receivable
-- (por ejemplo, facturas creadas originalmente de contado y luego editadas a crédito desde el historial).

-- 1. Si un documento a crédito tiene customer_id NULL pero tiene metadata->>'customerName', vincularlo al cliente existente
UPDATE inventory_documents d
SET customer_id = (
  SELECT c.id
  FROM customers c
  WHERE lower(trim(c.display_name)) = lower(trim(d.metadata->>'customerName'))
  ORDER BY c.is_active DESC, c.created_at ASC
  LIMIT 1
)
WHERE d.status = 'completed'
  AND d.exit_kind = 'credit'
  AND d.customer_id IS NULL
  AND COALESCE(trim(d.metadata->>'customerName'), '') <> ''
  AND EXISTS (
    SELECT 1
    FROM customers c
    WHERE lower(trim(c.display_name)) = lower(trim(d.metadata->>'customerName'))
  );

-- 2. Insertar filas faltantes en accounts_receivable para documentos completados con exit_kind = 'credit'
INSERT INTO accounts_receivable (
  document_id,
  invoice_number,
  warehouse_id,
  customer_id,
  total_amount,
  initial_payment,
  paid_amount,
  balance_amount,
  status,
  notes,
  created_by,
  created_at,
  paid_at
)
SELECT
  d.id AS document_id,
  COALESCE(NULLIF(trim(d.invoice_number), ''), 'DOC-' || SUBSTRING(d.id::text, 1, 6)) AS invoice_number,
  d.warehouse_id,
  d.customer_id,
  calc.net_total AS total_amount,
  calc.init_paid AS initial_payment,
  calc.init_paid AS paid_amount,
  GREATEST(0, calc.net_total - calc.init_paid) AS balance_amount,
  CASE
    WHEN GREATEST(0, calc.net_total - calc.init_paid) <= 0 THEN 'paid'
    WHEN calc.init_paid > 0 THEN 'partial'
    ELSE 'open'
  END AS status,
  d.notes,
  d.created_by,
  COALESCE(d.completed_at, d.created_at, now()) AS created_at,
  CASE
    WHEN GREATEST(0, calc.net_total - calc.init_paid) <= 0 THEN COALESCE(d.completed_at, d.created_at, now())
    ELSE NULL
  END AS paid_at
FROM inventory_documents d
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0, ROUND((
      COALESCE((
        SELECT SUM(idl.quantity * COALESCE(idl.unit_sale_price, p.base_sale_price, 0))
        FROM inventory_document_lines idl
        JOIN products p ON p.id = idl.product_id
        WHERE idl.document_id = d.id
      ), 0) - COALESCE(d.discount_amount, 0)
    )::numeric, 2)) AS net_total,
    LEAST(
      GREATEST(0, ROUND((
        COALESCE((
          SELECT SUM(idl.quantity * COALESCE(idl.unit_sale_price, p.base_sale_price, 0))
          FROM inventory_document_lines idl
          JOIN products p ON p.id = idl.product_id
          WHERE idl.document_id = d.id
        ), 0) - COALESCE(d.discount_amount, 0)
      )::numeric, 2)),
      COALESCE((
        SELECT ROUND(SUM(
          CASE
            WHEN (elem->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN (elem->>'amount')::numeric
            ELSE 0
          END
        )::numeric, 2)
        FROM jsonb_array_elements(
          CASE
            WHEN d.metadata IS NOT NULL
             AND jsonb_typeof(d.metadata) = 'object'
             AND jsonb_typeof(d.metadata->'paymentBreakdown') = 'array'
            THEN d.metadata->'paymentBreakdown'
            ELSE '[]'::jsonb
          END
        ) AS elem
      ), 0)
    ) AS init_paid
) calc
WHERE d.status = 'completed'
  AND d.exit_kind = 'credit'
  AND d.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM accounts_receivable ar
    WHERE ar.document_id = d.id
  );
