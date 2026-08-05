import type { NextFunction, Request, Response } from "express";
import { getPool } from "../db.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { loadAuthContext } from "../services/auth-context.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  let userId: string;
  try {
    const payload = verifyAccessToken(token);
    userId = payload.sub;
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  try {
    const ctx = await loadAuthContext(pool, userId);
    if (!ctx) {
      res.status(401).json({ error: "user_inactive_or_missing" });
      return;
    }
    req.auth = ctx;
    next();
  } catch (err) {
    next(err);
  }
}
