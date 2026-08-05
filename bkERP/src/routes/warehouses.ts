import { Router } from "express";
import { getPool } from "../db.js";
import { firstPathParam } from "../lib/path-params.js";
import { isUuid } from "../lib/uuid.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRoles.js";

/** Listado completo + alta/edición de sedes: solo super administración. */
const superAdminOnly = requireAnyRole("super_admin");

export function createWarehousesRouter(): Router {
  const r = Router();

  r.get("/manage", requireAuth, superAdminOnly, async (_req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT id::text, code, name, address, is_active, is_factory, created_at
         FROM warehouses
         ORDER BY is_active DESC, name`
      );
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  r.post("/", requireAuth, superAdminOnly, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const address =
      req.body?.address === null || req.body?.address === undefined
        ? null
        : String(req.body.address).trim() || null;
    const is_factory = typeof req.body?.is_factory === "boolean" ? req.body.is_factory : false;
    if (!code || !name) {
      res.status(400).json({ error: "code_and_name_required" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO warehouses (code, name, address, is_factory)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text, code, name, address, is_active, is_factory, created_at`,
        [code, name, address, is_factory]
      );
      res.status(201).json({ item: rows[0] });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "23505") {
        res.status(409).json({ error: "code_already_exists" });
        return;
      }
      next(err);
    }
  });

  r.patch("/:id", requireAuth, superAdminOnly, async (req, res, next) => {
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
    const body = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (typeof body.code === "string") {
      sets.push(`code = $${i++}`);
      vals.push(body.code.trim());
    }
    if (typeof body.name === "string") {
      sets.push(`name = $${i++}`);
      vals.push(body.name.trim());
    }
    if ("address" in body) {
      sets.push(`address = $${i++}`);
      vals.push(body.address == null ? null : String(body.address).trim() || null);
    }
    if (typeof body.is_active === "boolean") {
      sets.push(`is_active = $${i++}`);
      vals.push(body.is_active);
    }
    if (typeof body.is_factory === "boolean") {
      sets.push(`is_factory = $${i++}`);
      vals.push(body.is_factory);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "no_fields" });
      return;
    }
    vals.push(rawId);
    try {
      const { rows } = await pool.query(
        `UPDATE warehouses SET ${sets.join(", ")}
         WHERE id = $${i}::uuid
         RETURNING id::text, code, name, address, is_active, is_factory, created_at`,
        vals
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ item: rows[0] });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "23505") {
        res.status(409).json({ error: "code_already_exists" });
        return;
      }
      next(err);
    }
  });

  r.get("/", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    try {
      if (auth.warehouseIds === null) {
        const { rows } = await pool.query(
          `SELECT id::text, code, name, is_active, is_factory, created_at
           FROM warehouses
           WHERE is_active = true
           ORDER BY name`
        );
        res.json({ items: rows });
        return;
      }

      if (auth.warehouseIds.length === 0) {
        res.json({ items: [] });
        return;
      }

      const { rows } = await pool.query(
        `SELECT id::text, code, name, is_active, is_factory, created_at
         FROM warehouses
         WHERE is_active = true AND id = ANY($1::uuid[])
         ORDER BY name`,
        [auth.warehouseIds]
      );
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
