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
    roles: string[] | null;
    unrestricted: boolean | null;
    warehouse_ids: string[] | null;
  }>(
    `
    WITH u AS (
      SELECT id, email, full_name
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
      SELECT COALESCE(bool_or(code IN ('super_admin', 'secretaria')), false) AS unrestricted
      FROM role_codes
    )
    SELECT
      u.id::text,
      u.email,
      u.full_name,
      COALESCE((SELECT array_agg(code ORDER BY code) FROM role_codes), '{}') AS roles,
      (SELECT unrestricted FROM flags) AS unrestricted,
      CASE
        WHEN (SELECT unrestricted FROM flags) THEN NULL::uuid[]
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

  const warehouseIds = row.unrestricted
    ? null
    : (row.warehouse_ids ?? []).map((id) => String(id));

  return {
    userId: row.id,
    email: row.email,
    fullName: row.full_name,
    roles: row.roles ?? [],
    warehouseIds,
  };
}
