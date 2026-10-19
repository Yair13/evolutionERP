import { Router } from "express";
import { getPool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRoles.js";
import { resetSystemData, cleanOperationalTestData } from "../services/system-reset.js";

const superAdminOnly = requireAnyRole("super_admin");
const REQUIRED_CONFIRM_PHRASE = "ELIMINAR TODO";
const REQUIRED_CLEAN_TEST_PHRASE = "LIMPIAR PRUEBAS";

export function createSystemRouter(): Router {
  const r = Router();

  /**
   * Limpia únicamente operaciones de prueba (ventas, compras, movimientos, deudas, apartados, nómina, cierres)
   * CONSERVANDO intacto el catálogo de productos, imágenes, sedes, usuarios, empleados y proveedores.
   */
  r.post("/clean-test-data", requireAuth, superAdminOnly, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const confirmText =
      typeof req.body?.confirmText === "string" ? req.body.confirmText.trim().toUpperCase() : "";

    if (confirmText !== REQUIRED_CLEAN_TEST_PHRASE) {
      res.status(400).json({ error: "confirmation_phrase_invalid", expected: REQUIRED_CLEAN_TEST_PHRASE });
      return;
    }

    try {
      const result = await cleanOperationalTestData(pool);
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/reset", requireAuth, superAdminOnly, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const confirmText =
      typeof req.body?.confirmText === "string" ? req.body.confirmText.trim().toUpperCase() : "";

    if (confirmText !== REQUIRED_CONFIRM_PHRASE) {
      res.status(400).json({ error: "confirmation_phrase_invalid" });
      return;
    }

    try {
      const result = await resetSystemData(pool, {
        keepUserId: req.auth!.userId,
        preferredAdminEmail: process.env.SEED_ADMIN_EMAIL?.trim(),
      });
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
