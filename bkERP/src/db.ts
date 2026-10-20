import pg from "pg";

const { Pool, types } = pg;

// Evitar que node-postgres desplace columnas DATE a UTC o reste días por huso horario:
types.setTypeParser(1082, (val: string) => val);

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.PGPOOL_MAX) || 10,
      options: "-c timezone=America/Bogota",
    });
  }
  return pool;
}

export type DbHealth =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string }
  | { skipped: true };

export async function checkDb(): Promise<DbHealth> {
  const p = getPool();
  if (!p) return { skipped: true };
  const started = Date.now();
  try {
    await p.query("SELECT 1 AS ok");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return { ok: false, error: message };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
