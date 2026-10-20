import "dotenv/config";

// Garantizar hora de Colombia en Node.js
process.env.TZ = "America/Bogota";
import compression from "compression";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { join } from "node:path";
import { checkDb, closePool } from "./db.js";
import { ensureUploadsDir, UPLOADS_ROOT } from "./lib/product-uploads.js";
import { createAuthRouter } from "./routes/auth.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createRolesRouter } from "./routes/roles.js";
import { createUsersRouter } from "./routes/users.js";
import { createInventoryRouter } from "./routes/inventory.js";
import { createFinanceRouter } from "./routes/finance.js";
import { createSystemRouter } from "./routes/system.js";
import { createWarehousesRouter } from "./routes/warehouses.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

/** 30 días: variantes WebP casi no cambian tras subir. */
const UPLOADS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

app.use(cors());
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  })
);
app.use(express.json());
app.use(
  "/uploads",
  express.static(join(UPLOADS_ROOT), {
    maxAge: UPLOADS_MAX_AGE_MS,
    etag: true,
    lastModified: true,
    immutable: false,
  })
);

app.get("/health", async (_req, res) => {
  const db = await checkDb();
  res.json({
    ok: true,
    service: "evolution-erp-api",
    database: db,
  });
});

app.use("/auth", createAuthRouter());
app.use("/dashboard", createDashboardRouter());
app.use("/roles", createRolesRouter());
app.use("/users", createUsersRouter());
app.use("/warehouses", createWarehousesRouter());
app.use("/inventory", createInventoryRouter());
app.use("/finance", createFinanceRouter());
app.use("/system", createSystemRouter());

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const e = err as { code?: string; message?: string; statusCode?: number; status?: number };
  if (e?.statusCode && typeof e.statusCode === "number") {
    res.status(e.statusCode).json({ error: e.message || "error" });
    return;
  }
  if (e?.status && typeof e.status === "number") {
    res.status(e.status).json({ error: e.message || "error" });
    return;
  }
  if (e?.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "file_too_large" });
    return;
  }
  if (e?.message === "invalid_image_type") {
    res.status(400).json({ error: "invalid_image_type" });
    return;
  }
  res.status(500).json({ error: "internal_error" });
});

await ensureUploadsDir();

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, closing…`);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
