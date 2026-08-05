import type { NextFunction, Request, Response } from "express";
import { firstPathParam } from "../lib/path-params.js";
import { isUuid } from "../lib/uuid.js";

declare global {
  namespace Express {
    interface Request {
      warehouseId?: string;
    }
  }
}

function readWarehouseId(req: Request): string | undefined {
  const header = req.headers["x-warehouse-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const q = req.query.warehouseId;
  if (typeof q === "string" && q.trim()) return q.trim();
  if (Array.isArray(q) && typeof q[0] === "string") return q[0].trim();
  const param = firstPathParam(req.params.warehouseId);
  return param?.trim();
}

export function requireWarehouse(req: Request, res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "missing_auth" });
    return;
  }

  const warehouseId = readWarehouseId(req);
  if (!warehouseId || !isUuid(warehouseId)) {
    res.status(400).json({ error: "warehouse_id_required" });
    return;
  }

  if (auth.warehouseIds !== null && !auth.warehouseIds.includes(warehouseId)) {
    res.status(403).json({ error: "warehouse_forbidden" });
    return;
  }

  req.warehouseId = warehouseId;
  next();
}

/** Sets req.warehouseId when header/query/body provides a valid sede; does not fail if absent. */
export function resolveWarehouseOptional(req: Request, res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "missing_auth" });
    return;
  }

  const body = req.body as { stockWarehouseId?: unknown } | undefined;
  const fromBody =
    typeof body?.stockWarehouseId === "string" && body.stockWarehouseId.trim()
      ? body.stockWarehouseId.trim()
      : undefined;

  const warehouseId = fromBody ?? readWarehouseId(req);
  if (!warehouseId) {
    next();
    return;
  }

  if (!isUuid(warehouseId)) {
    res.status(400).json({ error: "invalid_warehouse_id" });
    return;
  }

  if (auth.warehouseIds !== null && !auth.warehouseIds.includes(warehouseId)) {
    res.status(403).json({ error: "warehouse_forbidden" });
    return;
  }

  req.warehouseId = warehouseId;
  next();
}
