import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

export async function runMigrations() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL no está definida.");
    return;
  }

  const migrationsDir = join(process.cwd(), "db", "migrations");
  let files: string[] = [];
  try {
    files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.warn(`No se pudo leer el directorio de migraciones en ${migrationsDir}:`, err);
    return;
  }

  if (files.length === 0) {
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         serial PRIMARY KEY,
        filename   text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set<string>();
    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    for (const r of rows) applied.add(r.filename);

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[Migraciones] Aplicado: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].replace(/\\/g, "/").endsWith("migrate.ts") ||
    process.argv[1].replace(/\\/g, "/").endsWith("migrate.js"));

if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log("Migraciones al día.");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
