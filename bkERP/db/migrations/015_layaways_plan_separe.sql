-- Evolution ERP: Sistema de Apartados / Plan Separe

-- 1. Tabla principal de apartados
CREATE TABLE IF NOT EXISTS layaways (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   text NOT NULL,
  warehouse_id           uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  customer_id            uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  target_amount          numeric(18, 2) NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  paid_amount            numeric(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  items                  jsonb NOT NULL DEFAULT '[]',
  expiry_date            date,
  notes                  text,
  created_by             uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  resulting_document_id  uuid REFERENCES inventory_documents (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_layaways_wh_status ON layaways (warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_layaways_customer ON layaways (customer_id);
CREATE INDEX IF NOT EXISTS idx_layaways_code ON layaways (code);
CREATE INDEX IF NOT EXISTS idx_layaways_created ON layaways (created_at DESC);

COMMENT ON TABLE layaways IS 'Apartados y plan separe de clientes con abonos previos.';

-- 2. Tabla de abonos al apartado
CREATE TABLE IF NOT EXISTS layaway_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layaway_id      uuid NOT NULL REFERENCES layaways (id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  warehouse_id    uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  receipt_number  text NOT NULL,
  payment_method  text NOT NULL,
  amount          numeric(18, 2) NOT NULL CHECK (amount > 0),
  notes           text,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layaway_payments_layaway ON layaway_payments (layaway_id);
CREATE INDEX IF NOT EXISTS idx_layaway_payments_customer ON layaway_payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_layaway_payments_wh_date ON layaway_payments (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_layaway_payments_receipt ON layaway_payments (receipt_number);

COMMENT ON TABLE layaway_payments IS 'Abonos registrados a los apartados.';
