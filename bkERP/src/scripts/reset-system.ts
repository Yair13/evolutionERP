import "dotenv/config";
import { closePool, getPool } from "../db.js";
import { resetSystemData } from "../services/system-reset.js";

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  try {
    const result = await resetSystemData(pool, {
      preferredAdminEmail: process.env.SEED_ADMIN_EMAIL?.trim(),
    });
    console.log("Sistema limpiado exitosamente.");
    console.log(
      `Sede conservada: ${result.keptWarehouse.name} (${result.keptWarehouse.code} - ${result.keptWarehouse.id})`
    );
    console.log(
      `Super Admin conservado: ${result.keptUser.fullName} <${result.keptUser.email}> (${result.keptUser.id})`
    );
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error("Error limpiando el sistema:", err);
  process.exit(1);
});
