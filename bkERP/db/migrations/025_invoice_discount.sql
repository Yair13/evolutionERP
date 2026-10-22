-- 025_invoice_discount.sql
-- Agrega soporte para descuentos monetarios a nivel de factura/comprobante de salida

ALTER TABLE inventory_documents
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason TEXT;

COMMENT ON COLUMN inventory_documents.discount_amount IS 'Valor monetario descontado al total de la factura por promociones, convenios u obsequios.';
COMMENT ON COLUMN inventory_documents.discount_reason IS 'Motivo u observación del descuento aplicado (ej: Obsequio, Promoción, etc.).';
