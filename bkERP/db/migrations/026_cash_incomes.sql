-- Migration 026: Recibos de Caja / Otros Ingresos (Devoluciones de conductores, venta de rezagos/cuero, etc.)
-- y su integración en Cierres Diarios y Cierres Generales.

-- 1. Tabla de Recibos de Caja / Otros Ingresos
CREATE TABLE IF NOT EXISTS cash_incomes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number   text NOT NULL,
  warehouse_id     uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  category         text NOT NULL DEFAULT 'other',
  concept          text NOT NULL,
  payer_name       text NOT NULL,
  payer_doc        text,
  payer_phone      text,
  amount           numeric(18, 2) NOT NULL CHECK (amount > 0),
  payment_method   text NOT NULL,
  reference_code   text,
  receipt_url      text,
  receipt_filename varchar(255),
  receipt_urls     jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes            text,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ci_voucher ON cash_incomes (voucher_number);
CREATE INDEX IF NOT EXISTS idx_ci_warehouse ON cash_incomes (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_ci_created_at ON cash_incomes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ci_category ON cash_incomes (category);
CREATE INDEX IF NOT EXISTS idx_ci_payment_method ON cash_incomes (payment_method);

-- 2. Integrar en Cierres Diarios (daily_closures)
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_other_incomes numeric(18, 2) NOT NULL DEFAULT 0;

-- 3. Integrar en Cierres Generales (global_closures)
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_other_incomes numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_cash_other_incomes numeric(18, 2) NOT NULL DEFAULT 0;
