-- Conteo físico / inventario inicial: sesión abierta + líneas con esperado vs contado

CREATE TABLE IF NOT EXISTS inventory_counts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id     uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'completed', 'cancelled')),
  count_kind       text NOT NULL DEFAULT 'audit'
                   CHECK (count_kind IN ('initial', 'audit')),
  notes            text,
  invoice_number   text,
  document_id      uuid REFERENCES inventory_documents (id) ON DELETE SET NULL,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_counts_one_open
  ON inventory_counts (warehouse_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_inventory_counts_warehouse_created
  ON inventory_counts (warehouse_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id            uuid NOT NULL REFERENCES inventory_counts (id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  expected_quantity   numeric(18, 4) NOT NULL DEFAULT 0,
  counted_quantity    numeric(18, 4) NOT NULL DEFAULT 0,
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_count
  ON inventory_count_lines (count_id);

COMMENT ON TABLE inventory_counts IS
  'Sesión de conteo físico: inventario inicial o auditoría/descuadre por sede.';
COMMENT ON COLUMN inventory_counts.count_kind IS
  'initial = inventario inicial; audit = conteo para detectar descuadres.';
COMMENT ON COLUMN inventory_count_lines.expected_quantity IS
  'Stock del sistema al abrir la sesión (congelado).';
COMMENT ON COLUMN inventory_count_lines.counted_quantity IS
  'Cantidad física pistoleada o ingresada manualmente.';
