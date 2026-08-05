-- Inventario visual: catálogo, imágenes, documentos operativos

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS internal_code text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'und',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_status_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_status_check
      CHECK (status IN ('active', 'draft', 'discontinued'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku ON products (sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_internal_code ON products (internal_code) WHERE internal_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  url         text NOT NULL,
  thumb_url   text,
  sort_order  int NOT NULL DEFAULT 0,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id, sort_order);

CREATE TABLE IF NOT EXISTS product_price_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  field       text NOT NULL CHECK (field IN ('base_sale_price', 'production_cost')),
  old_value   numeric(18, 2),
  new_value   numeric(18, 2) NOT NULL,
  changed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON product_price_history (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  doc_type      text NOT NULL CHECK (doc_type IN (
    'entry', 'exit', 'warranty', 'exchange', 'return', 'adjustment'
  )),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending', 'approved', 'rejected', 'in_review', 'completed', 'cancelled'
  )),
  customer_id   uuid REFERENCES customers (id) ON DELETE SET NULL,
  reason        text,
  notes         text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inventory_documents_wh ON inventory_documents (warehouse_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_document_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES inventory_documents (id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity        numeric(18, 4) NOT NULL,
  unit_cost       numeric(18, 4),
  unit_sale_price numeric(18, 4),
  line_notes      text
);

CREATE TABLE IF NOT EXISTS document_status_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES inventory_documents (id) ON DELETE CASCADE,
  status      text NOT NULL,
  comment     text,
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW v_catalog_stock AS
SELECT
  s.warehouse_id,
  s.product_id,
  s.quantity_on_hand,
  COALESCE(wps.min_stock_level, 0)::numeric(18, 4) AS min_stock_level,
  COALESCE(wps.critical_stock_level, 0)::numeric(18, 4) AS critical_stock_level,
  CASE
    WHEN s.quantity_on_hand <= 0 THEN 'out'
    WHEN s.quantity_on_hand <= COALESCE(wps.critical_stock_level, 0) THEN 'critical'
    WHEN s.quantity_on_hand <= COALESCE(wps.min_stock_level, 0) THEN 'low'
    ELSE 'ok'
  END AS stock_signal
FROM v_warehouse_product_stock s
LEFT JOIN warehouse_product_settings wps
  ON wps.warehouse_id = s.warehouse_id AND wps.product_id = s.product_id;

COMMENT ON VIEW v_catalog_stock IS 'Stock por sede con semáforo para catálogo visual.';
