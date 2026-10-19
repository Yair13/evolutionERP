-- 020_accounting_general_closures.sql
-- Cierres Contables Generales por rango de fechas (fecha inicio y fecha fin)
-- por sede o consolidado, con fondo que se deja en caja para la sede.

ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS closure_code VARCHAR(50);
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS date_from DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS date_to DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_sales NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_cash_sales NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_bank_sales NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_credit_payments NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_layaway_payments NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_outflows NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_payroll NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS total_net_cash NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS cash_to_keep NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS cash_to_withdraw NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS payment_breakdown JSONB NOT NULL DEFAULT '[]';
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_gc_warehouse ON global_closures(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_gc_dates ON global_closures(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_gc_code ON global_closures(closure_code);
