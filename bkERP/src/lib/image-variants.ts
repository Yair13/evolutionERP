/** Variantes generadas al subir (WebP). Tamaños pensados para cada contenedor del ERP. */
export const IMAGE_VARIANT_SPECS = [
  { key: "xs" as const, filenameSuffix: "-xs", maxSize: 96, cover: true, quality: 76 },
  { key: "sm" as const, filenameSuffix: "-thumb", maxSize: 280, cover: true, quality: 78 },
  { key: "md" as const, filenameSuffix: "-md", maxSize: 520, cover: true, quality: 80 },
  { key: "lg" as const, filenameSuffix: "", maxSize: 1200, cover: false, quality: 82 },
] as const;

export type ImageVariantKey = (typeof IMAGE_VARIANT_SPECS)[number]["key"];

export type ImageVariantsMap = Partial<Record<ImageVariantKey, string>>;

/** SQL: imagen para grillas, carrito, POS — sm/xs primero (menos datos en tablets). */
export const SQL_PICK_CATALOG_IMAGE = `COALESCE(
  NULLIF(pi.variants->>'sm', ''),
  NULLIF(pi.variants->>'xs', ''),
  NULLIF(pi.variants->>'md', ''),
  pi.thumb_url,
  pi.url
)`;

/** SQL: imagen grande (lightbox, ficha). */
export const SQL_PICK_CATALOG_IMAGE_LG = `COALESCE(
  NULLIF(pi.variants->>'lg', ''),
  pi.url
)`;

/** Subconsulta de imagen principal del producto (alias pi). */
export function sqlProductImageSubselect(pickExpr: string): string {
  return `(
    SELECT ${pickExpr}
    FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    LIMIT 1
  )`;
}
