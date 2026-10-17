import { Router } from "express";
import { getPool } from "../db.js";
import { isUuid } from "../lib/uuid.js";
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
    const requestedWh =
      typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    let effectiveWarehouseIds = auth.hasAdminAccess ? null : auth.warehouseIds;
    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (auth.warehouseIds !== null && !auth.warehouseIds.includes(requestedWh)) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      effectiveWarehouseIds = [requestedWh];
    }

    try {
      const summary = await getDashboardSummary(pool, { warehouseIds: effectiveWarehouseIds });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
