-- La edición activa aplica solo al día calendario en que se habilitó (zona Colombia)

ALTER TABLE inventory_movement_settings
  ADD COLUMN IF NOT EXISTS editing_date date;

COMMENT ON COLUMN inventory_movement_settings.editing_date IS 'Fecha (día) para la cual entry/exit_editing_enabled están vigentes.';
