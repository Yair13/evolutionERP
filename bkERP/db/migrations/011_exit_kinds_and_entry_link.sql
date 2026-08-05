-- Ampliar exit_kind y movement_type; evitar doble recepción de factura de origen

-- exit_kind: tipos usados por la app (distribución, traslado, cambio, etc.)
ALTER TABLE inventory_documents
  DROP CONSTRAINT IF EXISTS inventory_documents_exit_kind_check;

ALTER TABLE inventory_documents
  ADD CONSTRAINT inventory_documents_exit_kind_check
  CHECK (
    exit_kind IS NULL OR exit_kind IN (
      'sale',
      'return',
      'credit',
      'warranty',
      'distribution',
      'transfer',
      'return_to_factory',
      'exchange'
    )
  );

COMMENT ON COLUMN inventory_documents.exit_kind IS
  'Subtipo de salida: sale, return, credit, warranty, distribution, transfer, return_to_factory, exchange.';

-- movement_type: incluir valores legacy y canónicos usados por el servicio
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'entry_factory',
    'sale',
    'exchange',
    'warranty',
    'return_in',
    'return',
    'payment',
    'credit',
    'transfer_out',
    'transfer_in',
    'transfer',
    'adjustment',
    'inventory_close'
  ));

-- Una factura de origen solo puede recibirse una vez en una entrada completed
CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_origin_invoice_once
  ON inventory_documents ((metadata->>'originInvoiceNumber'))
  WHERE doc_type = 'entry'
    AND status = 'completed'
    AND COALESCE(metadata->>'originInvoiceNumber', '') <> '';
