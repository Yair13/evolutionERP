-- Migration 021: Soporte para múltiples fotos y comprobantes en operaciones por cuenta / banco
-- y comprobantes en pagos a proveedores (cuentas por pagar).

-- 1. Ventas y salidas (inventory_documents)
ALTER TABLE inventory_documents ADD COLUMN IF NOT EXISTS receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Abonos de clientes a créditos / cartera (receivable_payments)
ALTER TABLE receivable_payments ADD COLUMN IF NOT EXISTS receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Abonos de clientes a apartados / plan separe (layaway_payments)
ALTER TABLE layaway_payments ADD COLUMN IF NOT EXISTS receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. Comprobantes de egreso / salidas de dinero (cash_outflows)
ALTER TABLE cash_outflows ADD COLUMN IF NOT EXISTS receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5. Pagos a proveedores (payable_payments)
ALTER TABLE payable_payments ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE payable_payments ADD COLUMN IF NOT EXISTS receipt_filename varchar(255);
ALTER TABLE payable_payments ADD COLUMN IF NOT EXISTS receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 6. Traslados de dinero entre sedes (cash_transfers)
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS sender_receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS receiver_receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 7. Pagos de nómina (payroll_payments)
ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS transfer_receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: sincronizar fotos existentes de receipt_url hacia receipt_urls si este último está vacío
UPDATE inventory_documents
SET receipt_urls = jsonb_build_array(receipt_url)
WHERE receipt_url IS NOT NULL AND (receipt_urls IS NULL OR receipt_urls = '[]'::jsonb);

UPDATE receivable_payments
SET receipt_urls = jsonb_build_array(receipt_url)
WHERE receipt_url IS NOT NULL AND (receipt_urls IS NULL OR receipt_urls = '[]'::jsonb);

UPDATE layaway_payments
SET receipt_urls = jsonb_build_array(receipt_url)
WHERE receipt_url IS NOT NULL AND (receipt_urls IS NULL OR receipt_urls = '[]'::jsonb);

UPDATE cash_outflows
SET receipt_urls = jsonb_build_array(receipt_url)
WHERE receipt_url IS NOT NULL AND (receipt_urls IS NULL OR receipt_urls = '[]'::jsonb);

UPDATE cash_transfers
SET sender_receipt_urls = jsonb_build_array(sender_receipt_url)
WHERE sender_receipt_url IS NOT NULL AND (sender_receipt_urls IS NULL OR sender_receipt_urls = '[]'::jsonb);

UPDATE cash_transfers
SET receiver_receipt_urls = jsonb_build_array(receiver_receipt_url)
WHERE receiver_receipt_url IS NOT NULL AND (receiver_receipt_urls IS NULL OR receiver_receipt_urls = '[]'::jsonb);

UPDATE payroll_payments
SET transfer_receipt_urls = jsonb_build_array(transfer_receipt_url)
WHERE transfer_receipt_url IS NOT NULL AND (transfer_receipt_urls IS NULL OR transfer_receipt_urls = '[]'::jsonb);
