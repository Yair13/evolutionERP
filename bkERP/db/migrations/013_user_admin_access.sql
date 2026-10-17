-- Evolution ERP: permiso explícito de acceso a la Sede Administrativa por usuario

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_admin_access boolean NOT NULL DEFAULT false;

-- Activar por defecto para usuarios actuales con rol super_admin o secretaria
UPDATE users u
SET has_admin_access = true
WHERE EXISTS (
  SELECT 1
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id AND r.code IN ('super_admin', 'secretaria')
);
