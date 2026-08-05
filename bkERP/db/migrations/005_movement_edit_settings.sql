-- Permisos de edición de entradas/salidas (solo super admin configura y edita)

CREATE TABLE IF NOT EXISTS inventory_movement_settings (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  entry_editing_enabled boolean NOT NULL DEFAULT false,
  exit_editing_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);

INSERT INTO inventory_movement_settings (singleton)
VALUES (1)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE inventory_movement_settings IS 'Super admin: habilita edición de entradas y salidas completadas.';
