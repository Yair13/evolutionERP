import { Router } from "express";
import { getPool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRoles.js";

export function createRolesRouter(): Router {
  const r = Router();

  r.get(
    "/",
    requireAuth,
    requireAnyRole("super_admin", "secretaria"),
    async (_req, res, next) => {
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: "database_not_configured" });
        return;
      }
      try {
        const { rows } = await pool.query<{ id: string; code: string; name: string }>(
          `SELECT id::text, code, name FROM roles ORDER BY name`
        );
        res.json({ items: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  return r;
}
