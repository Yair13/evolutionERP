/**
 * Regenera variantes (xs/sm/md/lg) desde archivos ya guardados en uploads/.
 *
 * Uso: npm run images:reprocess
 * Requiere: DATABASE_URL y migración 008_product_image_variants aplicada.
 */
import "dotenv/config";
import { closePool, getPool } from "../db.js";
import { regenerateImageVariants } from "../lib/product-image-process.js";

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  const { rows } = await pool.query<{
    id: string;
    product_id: string;
    url: string;
    thumb_url: string | null;
  }>(`
    SELECT id::text, product_id::text, url, thumb_url
    FROM product_images
    ORDER BY product_id, sort_order, created_at
  `);

  if (rows.length === 0) {
    console.log("No hay imágenes en product_images.");
    await closePool();
    return;
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;

  console.log(`Reprocesando ${rows.length} imagen(es)…\n`);

  for (const row of rows) {
    const label = `${row.product_id.slice(0, 8)}… / ${row.id.slice(0, 8)}…`;
    try {
      const result = await regenerateImageVariants(
        row.product_id,
        row.id,
        row.url,
        row.thumb_url
      );

      if (!result) {
        skip += 1;
        console.warn(`  ⊘ ${label} — sin archivo fuente en disco`);
        continue;
      }

      await pool.query(
        `
        UPDATE product_images
        SET url = $2, thumb_url = $3, variants = $4::jsonb
        WHERE id = $1::uuid
        `,
        [row.id, result.url, result.thumbUrl, JSON.stringify(result.variants)]
      );

      ok += 1;
      console.log(`  ✓ ${label}`);
    } catch (err) {
      fail += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label} — ${msg}`);
    }
  }

  console.log(`\nListo: ${ok} OK, ${skip} sin archivo, ${fail} error(es).`);
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
