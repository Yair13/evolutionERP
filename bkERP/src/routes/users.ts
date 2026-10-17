import { Router } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../db.js";
import { hashPassword } from "../lib/password.js";
import { firstPathParam } from "../lib/path-params.js";
import { isUuid } from "../lib/uuid.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hasRole, requireAnyRole } from "../middleware/requireRoles.js";

const manageRoles = requireAnyRole("super_admin", "secretaria");

export function createUsersRouter(): Router {
  const r = Router();

  r.get("/", requireAuth, manageRoles, async (_req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    try {
      const { rows } = await pool.query<{
        id: string;
        email: string;
        full_name: string;
        is_active: boolean;
        has_admin_access: boolean;
        created_at: Date;
        roles: string[] | null;
        warehouse_ids: string[] | null;
      }>(
        `SELECT
           u.id::text,
           u.email,
           u.full_name,
           u.is_active,
           u.has_admin_access,
           u.created_at,
           COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
           COALESCE(array_agg(DISTINCT uw.warehouse_id::text) FILTER (WHERE uw.warehouse_id IS NOT NULL), '{}') AS warehouse_ids
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         LEFT JOIN user_warehouse uw ON uw.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at DESC`
      );
      res.json({
        items: rows.map((row) => {
          const roles = row.roles ?? [];
          return {
            id: row.id,
            email: row.email,
            fullName: row.full_name,
            isActive: row.is_active,
            hasAdminAccess: Boolean(row.has_admin_access || roles.includes("super_admin")),
            createdAt: new Date(row.created_at).toISOString(),
            roles,
            warehouseIds: row.warehouse_ids ?? [],
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/:id", requireAuth, manageRoles, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawId = firstPathParam(req.params.id);
    if (!rawId || !isUuid(rawId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const { rows } = await pool.query<{
        id: string;
        email: string;
        full_name: string;
        is_active: boolean;
        has_admin_access: boolean;
        created_at: Date;
        roles: string[] | null;
        warehouse_ids: string[] | null;
      }>(
        `SELECT
           u.id::text,
           u.email,
           u.full_name,
           u.is_active,
           u.has_admin_access,
           u.created_at,
           COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
           COALESCE(array_agg(DISTINCT uw.warehouse_id::text) FILTER (WHERE uw.warehouse_id IS NOT NULL), '{}') AS warehouse_ids
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         LEFT JOIN user_warehouse uw ON uw.user_id = u.id
         WHERE u.id = $1::uuid
         GROUP BY u.id`,
        [rawId]
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const roles = row.roles ?? [];
      res.json({
        item: {
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          isActive: row.is_active,
          hasAdminAccess: Boolean(row.has_admin_access || roles.includes("super_admin")),
          createdAt: new Date(row.created_at).toISOString(),
          roles,
          warehouseIds: row.warehouse_ids ?? [],
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/", requireAuth, manageRoles, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    const rawIdentifier =
      typeof req.body?.username === "string"
        ? req.body.username
        : typeof req.body?.email === "string"
          ? req.body.email
          : "";
    const username = rawIdentifier.trim().toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    const roleCodes = Array.isArray(req.body?.roleCodes) ? req.body.roleCodes.filter((x: unknown) => typeof x === "string") : [];
    const warehouseIds = Array.isArray(req.body?.warehouseIds)
      ? req.body.warehouseIds.filter((x: unknown) => typeof x === "string" && isUuid(x))
      : [];
    const hasAdminAccess = roleCodes.includes("super_admin")
      ? true
      : Boolean(req.body?.hasAdminAccess);

    if (!username || !password || !fullName) {
      res.status(400).json({ error: "username_password_fullname_required" });
      return;
    }
    if (!/^[a-z0-9._@+-]{3,}$/.test(username)) {
      res.status(400).json({ error: "invalid_username" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }
    if (roleCodes.length === 0) {
      res.status(400).json({ error: "role_codes_required" });
      return;
    }

    if (roleCodes.includes("super_admin") && !hasRole(auth, "super_admin")) {
      res.status(403).json({ error: "only_super_admin_can_assign_super_admin" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await assertValidRoleCodes(client, roleCodes);
        const passwordHash = await hashPassword(password);
        const { rows: urows } = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, full_name, has_admin_access)
           VALUES ($1, $2, $3, $4)
           RETURNING id::text`,
          [username, passwordHash, fullName, hasAdminAccess]
        );
        const userId = urows[0]!.id;
        await replaceRoles(client, userId, roleCodes);
        await replaceWarehouses(client, userId, warehouseIds);
        await client.query("COMMIT");
        res.status(201).json({ id: userId });
      } catch (err) {
        await client.query("ROLLBACK");
        const e = err as { code?: string; message?: string };
        if (e?.code === "23505") {
          res.status(409).json({ error: "username_already_exists" });
          return;
        }
        if (e?.message === "invalid_role_codes") {
          res.status(400).json({ error: "invalid_role_codes" });
          return;
        }
        if (e?.message === "invalid_warehouse_ids") {
          res.status(400).json({ error: "invalid_warehouse_ids" });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  });

  r.patch("/:id", requireAuth, manageRoles, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawId = firstPathParam(req.params.id);
    if (!rawId || !isUuid(rawId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const auth = req.auth!;
    const userId = rawId;
    const body = req.body ?? {};

    const roleCodes = Array.isArray(body.roleCodes)
      ? body.roleCodes.filter((x: unknown) => typeof x === "string")
      : undefined;
    const warehouseIds = Array.isArray(body.warehouseIds)
      ? body.warehouseIds.filter((x: unknown) => typeof x === "string" && isUuid(x))
      : undefined;

    if (roleCodes && roleCodes.includes("super_admin") && !hasRole(auth, "super_admin")) {
      res.status(403).json({ error: "only_super_admin_can_assign_super_admin" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        if (typeof body.fullName === "string") {
          const fn = body.fullName.trim();
          if (!fn) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "invalid_full_name" });
            return;
          }
          await client.query(`UPDATE users SET full_name = $1, updated_at = now() WHERE id = $2::uuid`, [fn, userId]);
        }

        if (typeof body.is_active === "boolean") {
          await client.query(`UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2::uuid`, [
            body.is_active,
            userId,
          ]);
        }

        if (typeof body.hasAdminAccess === "boolean" || roleCodes?.includes("super_admin")) {
          const nextAdminAccess = roleCodes?.includes("super_admin")
            ? true
            : Boolean(body.hasAdminAccess);
          await client.query(
            `UPDATE users SET has_admin_access = $1, updated_at = now() WHERE id = $2::uuid`,
            [nextAdminAccess, userId]
          );
        }

        if (typeof body.password === "string" && body.password.length > 0) {
          if (body.password.length < 8) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "password_too_short" });
            return;
          }
          const passwordHash = await hashPassword(body.password);
          await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [
            passwordHash,
            userId,
          ]);
        }

        if (roleCodes) {
          if (roleCodes.length === 0) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "role_codes_required" });
            return;
          }
          await assertValidRoleCodes(client, roleCodes);
          await replaceRoles(client, userId, roleCodes);
          await replaceWarehouses(client, userId, warehouseIds ?? []);
        } else if (warehouseIds) {
          await replaceWarehouses(client, userId, warehouseIds);
        }

        await client.query("COMMIT");
        res.json({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK");
        const e = err as { message?: string };
        if (e?.message === "invalid_role_codes") {
          res.status(400).json({ error: "invalid_role_codes" });
          return;
        }
        if (e?.message === "invalid_warehouse_ids") {
          res.status(400).json({ error: "invalid_warehouse_ids" });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  });

  return r;
}

async function assertValidRoleCodes(client: PoolClient, roleCodes: string[]): Promise<void> {
  const unique = [...new Set(roleCodes)];
  const { rows } = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM roles WHERE code = ANY($1::text[])`,
    [unique]
  );
  if ((rows[0]?.c ?? 0) !== unique.length) {
    throw new Error("invalid_role_codes");
  }
}

async function replaceRoles(client: PoolClient, userId: string, roleCodes: string[]): Promise<void> {
  const unique = [...new Set(roleCodes)];
  await client.query(`DELETE FROM user_roles WHERE user_id = $1::uuid`, [userId]);
  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1::uuid, r.id
     FROM roles r
     WHERE r.code = ANY($2::text[])`,
    [userId, unique]
  );
}

async function replaceWarehouses(client: PoolClient, userId: string, warehouseIds: string[]): Promise<void> {
  await client.query(`DELETE FROM user_warehouse WHERE user_id = $1::uuid`, [userId]);
  if (warehouseIds.length === 0) return;
  const { rowCount } = await client.query(
    `INSERT INTO user_warehouse (user_id, warehouse_id)
     SELECT $1::uuid, w.id
     FROM warehouses w
     WHERE w.id = ANY($2::uuid[])`,
    [userId, warehouseIds]
  );
  if ((rowCount ?? 0) !== warehouseIds.length) {
    throw new Error("invalid_warehouse_ids");
  }
}
