import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error(`No hay archivos .sql en ${migrationsDir}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

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
      console.log(`omitido (ya aplicado): ${file}`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`aplicado: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }

  await client.end();
  console.log("Migraciones al día.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
