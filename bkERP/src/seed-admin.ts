import "dotenv/config";
import pg from "pg";
import { hashPassword } from "./lib/password.js";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    console.error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env para este script.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id::text FROM users WHERE lower(email) = lower($1)`,
      [email]
    );
    if (existing.length > 0) {
      const reset = process.env.SEED_RESET_ADMIN_PASSWORD === "1";
      if (reset) {
        const passwordHash = await hashPassword(password);
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = now() WHERE lower(email) = lower($2)`,
          [passwordHash, email]
        );
        console.log(`Contraseña actualizada para ${email}.`);
        return;
      }
      console.log(
        `Ya existe un usuario con email ${email}. No se hizo nada. ` +
          `Para forzar nueva contraseña: SEED_RESET_ADMIN_PASSWORD=1 en .env y vuelve a ejecutar.`
      );
      return;
    }

    await client.query("BEGIN");

    const { rows: wh } = await client.query<{ id: string }>(
      `INSERT INTO warehouses (code, name) VALUES ('MAIN', 'Principal') RETURNING id::text`
    );

    const passwordHash = await hashPassword(password);

    const { rows: u } = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id::text`,
      [email, passwordHash, "Administrador"]
    );

    const userId = u[0]!.id;
    const warehouseId = wh[0]!.id;

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1::uuid, r.id FROM roles r WHERE r.code = 'super_admin'`,
      [userId]
    );

    await client.query(
      `INSERT INTO user_warehouse (user_id, warehouse_id) VALUES ($1::uuid, $2::uuid)`,
      [userId, warehouseId]
    );

    await client.query("COMMIT");
    console.log(`Usuario admin creado: ${email} (super_admin). Almacén: Principal (${warehouseId}).`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* sin BEGIN activo */
    }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
