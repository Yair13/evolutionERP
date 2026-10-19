-- 019_daily_closures_enhanced.sql
-- Enriquecimiento de Cierres Diarios y adjuntos en salidas, traslados, ventas y abonos.

-- 1. Soportes en Salidas de Dinero (Egresos)
ALTER TABLE cash_outflows ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE cash_outflows ADD COLUMN IF NOT EXISTS receipt_filename VARCHAR(255);

-- 2. Soportes en Traslados de Dinero (Enviados y Recibidos)
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS sender_receipt_url TEXT;
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS sender_receipt_filename VARCHAR(255);
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS receiver_receipt_url TEXT;
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS receiver_receipt_filename VARCHAR(255);

-- 3. Soportes en Ventas (inventory_documents)
ALTER TABLE inventory_documents ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE inventory_documents ADD COLUMN IF NOT EXISTS receipt_filename VARCHAR(255);

-- 4. Soportes en Abonos de Cartera y Apartados
ALTER TABLE receivable_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE receivable_payments ADD COLUMN IF NOT EXISTS receipt_filename VARCHAR(255);

ALTER TABLE layaway_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE layaway_payments ADD COLUMN IF NOT EXISTS receipt_filename VARCHAR(255);

-- 5. Columnas enriquecidas en daily_closures
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_credit_payments NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_layaway_payments NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_transfers_received NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_transfers_sent NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_outflows NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cash_payroll NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS bank_payments_total NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS closing_voucher_number VARCHAR(50);
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(150);
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS pending_receipts_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dc_voucher ON daily_closures(closing_voucher_number);
