-- Edición por documento: se activa una vez, se edita una vez, luego se bloquea de nuevo.

ALTER TABLE inventory_documents
  ADD COLUMN IF NOT EXISTS editing_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS editing_unlocked_by uuid REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN inventory_documents.editing_unlocked_at IS 'Si no es NULL, el documento puede editarse una vez (solo movimientos del día).';
