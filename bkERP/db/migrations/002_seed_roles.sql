-- Datos mínimos de referencia (idempotente)
INSERT INTO roles (code, name) VALUES
  ('super_admin', 'Super administrador'),
  ('secretaria', 'Secretaría administrativa'),
  ('admin_local', 'Administrador de local')
ON CONFLICT (code) DO NOTHING;
