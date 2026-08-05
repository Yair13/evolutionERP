-- Salidas tipificadas (venta, crédito, garantía, devolución) y número de factura/comprobante

ALTER TABLE inventory_documents
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS exit_kind text CHECK (
    exit_kind IS NULL OR exit_kind IN ('sale', 'return', 'credit', 'warranty')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_documents_invoice_wh
  ON inventory_documents (warehouse_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

COMMENT ON COLUMN inventory_documents.invoice_number IS 'Número de comprobante de salida para impresión.';
COMMENT ON COLUMN inventory_documents.exit_kind IS 'Subtipo de salida: sale, return, credit, warranty.';
