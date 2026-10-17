import type pg from "pg";

export type AuthContext = NonNullable<Express.Request["auth"]>;

export async function loadAuthContext(
  pool: pg.Pool,
  userId: string
): Promise<AuthContext | null> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    full_name: string;
    has_admin_access: boolean;
    roles: string[] | null;
    is_super_admin: boolean | null;
    warehouse_ids: string[] | null;
  }>(
    `
    WITH u AS (
      SELECT id, email, full_name, has_admin_access
      FROM users
      WHERE id = $1::uuid AND is_active = true
    ),
    role_codes AS (
      SELECT r.code
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT id FROM u)
    ),
    flags AS (
      SELECT COALESCE(bool_or(code = 'super_admin'), false) AS is_super_admin
      FROM role_codes
    )
    SELECT
      u.id::text,
      u.email,
      u.full_name,
      u.has_admin_access,
      COALESCE((SELECT array_agg(code ORDER BY code) FROM role_codes), '{}') AS roles,
      (SELECT is_super_admin FROM flags) AS is_super_admin,
      CASE
        WHEN (SELECT is_super_admin FROM flags) THEN NULL::uuid[]
        ELSE COALESCE(
          ARRAY(SELECT uw.warehouse_id FROM user_warehouse uw WHERE uw.user_id = u.id),
          '{}'::uuid[]
        )
      END AS warehouse_ids
    FROM u
    `,
    [userId]
  );

  const row = rows[0];
  if (!row) return null;

  const isSuperAdmin = Boolean(row.is_super_admin);
  const hasAdminAccess = isSuperAdmin || Boolean(row.has_admin_access);
  const warehouseIds = isSuperAdmin
    ? null
    : (row.warehouse_ids ?? []).map((id) => String(id));

  return {
    userId: row.id,
    email: row.email,
    fullName: row.full_name,
    roles: row.roles ?? [],
    hasAdminAccess,
    warehouseIds,
  };
}
