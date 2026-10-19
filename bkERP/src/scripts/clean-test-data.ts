import "dotenv/config";
import { getPool, closePool } from "../db.js";
import { cleanOperationalTestData } from "../services/system-reset.js";

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error("Base de datos no configurada.");
    process.exit(1);
  }

  console.log("Iniciando limpieza de datos de prueba operacionales...");
  const res = await cleanOperationalTestData(pool);
  console.log("✓", res.message);
  console.log("✓ Elementos conservados intactos:", res.keptCounts);
  await closePool();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error al limpiar datos de prueba:", err);
  process.exit(1);
});
