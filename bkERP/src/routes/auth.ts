import { Router } from "express";
import { getPool } from "../db.js";
import { signAccessToken } from "../lib/jwt.js";
import { verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loadAuthContext } from "../services/auth-context.js";

export function createAuthRouter(): Router {
  const r = Router();

  r.post("/login", async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const rawIdentifier =
      typeof req.body?.username === "string"
        ? req.body.username
        : typeof req.body?.email === "string"
          ? req.body.email
          : "";
    const identifier = rawIdentifier.trim();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!identifier || !password) {
      res.status(400).json({ error: "username_and_password_required" });
      return;
    }

    try {
      const { rows } = await pool.query<{
        id: string;
        password_hash: string | null;
      }>(
        `SELECT id::text, password_hash FROM users WHERE lower(email) = lower($1) AND is_active = true`,
        [identifier]
      );
      const user = rows[0];
      if (!user?.password_hash) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }

      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }

      const ctx = await loadAuthContext(pool, user.id);
      if (!ctx) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }

      const token = signAccessToken(user.id);
      res.json({
        token,
        user: {
          id: ctx.userId,
          email: ctx.email,
          fullName: ctx.fullName,
          roles: ctx.roles,
          hasAdminAccess: ctx.hasAdminAccess,
          warehouseIds: ctx.warehouseIds,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/me", requireAuth, (req, res) => {
    const a = req.auth!;
    res.json({
      id: a.userId,
      email: a.email,
      fullName: a.fullName,
      roles: a.roles,
      hasAdminAccess: a.hasAdminAccess,
      warehouseIds: a.warehouseIds,
    });
  });

  return r;
}
