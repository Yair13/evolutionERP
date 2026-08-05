import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { ImageVariantsMap } from "../../lib/image-variants.js";
import { productUploadDir } from "../../lib/product-uploads.js";
import {
  deleteVariantFiles,
  writeAllVariants,
} from "../../lib/product-image-process.js";

const MAX_IMAGES_PER_PRODUCT = 12;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type SavedImage = {
  id: string;
  url: string;
  thumbUrl: string;
  variants: ImageVariantsMap;
  isPrimary: boolean;
};

export async function addProductImages(
  pool: pg.Pool,
  productId: string,
  files: { buffer: Buffer; mimetype: string }[]
): Promise<SavedImage[]> {
  if (files.length === 0) return [];

  for (const f of files) {
    if (!ALLOWED_MIME.has(f.mimetype)) {
      throw Object.assign(new Error("invalid_image_type"), { code: "invalid_image_type" });
    }
  }

  const { rows: countRows } = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM product_images WHERE product_id = $1::uuid`,
    [productId]
  );
  const existing = Number(countRows[0]?.c ?? 0);
  if (existing + files.length > MAX_IMAGES_PER_PRODUCT) {
    throw Object.assign(new Error("too_many_images"), { code: "too_many_images" });
  }

  const { rows: productRows } = await pool.query<{ id: string }>(
    `SELECT id::text FROM products WHERE id = $1::uuid`,
    [productId]
  );
  if (!productRows[0]) {
    throw Object.assign(new Error("product_not_found"), { code: "product_not_found" });
  }

  const dir = productUploadDir(productId);
  await mkdir(dir, { recursive: true });

  const { rows: hasPrimary } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM product_images WHERE product_id = $1::uuid AND is_primary) AS ok`,
    [productId]
  );
  let needPrimary = !hasPrimary[0]?.ok;

  const saved: SavedImage[] = [];

  for (const file of files) {
    const id = randomUUID();
    const variants = await writeAllVariants(productId, id, file.buffer);

    const url = variants.lg ?? variants.md ?? "";
    const thumbUrl = variants.sm ?? variants.xs ?? url;
    const isPrimary = needPrimary;
    needPrimary = false;

    const sortOrder = existing + saved.length;

    const { rows } = await pool.query<{ id: string }>(
      `
      INSERT INTO product_images (product_id, url, thumb_url, variants, sort_order, is_primary)
      VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6)
      RETURNING id::text
      `,
      [productId, url, thumbUrl, JSON.stringify(variants), sortOrder, isPrimary]
    );

    saved.push({
      id: rows[0]!.id,
      url,
      thumbUrl,
      variants,
      isPrimary,
    });
  }

  return saved;
}

export async function deleteProductImage(
  pool: pg.Pool,
  productId: string,
  imageId: string
): Promise<boolean> {
  const { rows } = await pool.query<{ id: string }>(
    `DELETE FROM product_images WHERE id = $1::uuid AND product_id = $2::uuid RETURNING id::text`,
    [imageId, productId]
  );
  if (!rows[0]) return false;

  await deleteVariantFiles(productId, imageId);

  const { rows: remaining } = await pool.query<{ id: string }>(
    `SELECT id::text FROM product_images WHERE product_id = $1::uuid ORDER BY sort_order, created_at`,
    [productId]
  );
  if (remaining.length > 0) {
    const { rows: prim } = await pool.query<{ has: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM product_images WHERE product_id = $1::uuid AND is_primary) AS has`,
      [productId]
    );
    if (!prim[0]?.has) {
      await pool.query(`UPDATE product_images SET is_primary = true WHERE id = $1::uuid`, [remaining[0]!.id]);
    }
  }

  return true;
}
