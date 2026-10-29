-- 028_direct_customer_payments.sql
-- Permite abonos a favor de clientes sin factura relacionada y soporte para saldos iniciales.

-- 1. Permitir receivable_id nulo para abonos directos sin factura
ALTER TABLE receivable_payments 
  ALTER COLUMN receivable_id DROP NOT NULL;

-- 2. Columna para marcar abonos de saldo inicial (migración/arranque previo)
ALTER TABLE receivable_payments 
  ADD COLUMN IF NOT EXISTS is_initial boolean NOT NULL DEFAULT false;

-- 3. Índice para búsqueda y control de saldos iniciales por cliente y sede
CREATE INDEX IF NOT EXISTS idx_rp_customer_initial 
  ON receivable_payments (customer_id, warehouse_id) 
  WHERE is_initial = true;
