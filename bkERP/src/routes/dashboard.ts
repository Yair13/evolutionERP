import { Router } from "express";
import { getPool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getDashboardSummary } from "../services/dashboard-summary.js";

export function createDashboardRouter(): Router {
  const r = Router();

  r.get("/summary", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const auth = req.auth!;
    try {
      const summary = await getDashboardSummary(pool, { warehouseIds: auth.warehouseIds });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
