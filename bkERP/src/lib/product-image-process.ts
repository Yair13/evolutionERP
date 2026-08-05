import { access, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { IMAGE_VARIANT_SPECS, type ImageVariantsMap } from "./image-variants.js";
import { productUploadDir, publicImagePath, UPLOADS_ROOT } from "./product-uploads.js";

export async function processToWebp(
  buffer: Buffer,
  maxSize: number,
  cover: boolean,
  quality: number
): Promise<Buffer> {
  let pipeline = sharp(buffer).rotate();
  if (cover) {
    pipeline = pipeline.resize(maxSize, maxSize, { fit: "cover", position: "centre" });
  } else {
    pipeline = pipeline.resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true });
  }
  return pipeline.webp({ quality }).toBuffer();
}

export function variantFilename(imageId: string, suffix: string): string {
  return suffix ? `${imageId}${suffix}.webp` : `${imageId}.webp`;
}

export function publicUrlToDiskPath(publicUrl: string): string {
  const rel = publicUrl.replace(/^\/uploads\//, "");
  return join(UPLOADS_ROOT, rel);
}

export async function writeAllVariants(
  productId: string,
  imageId: string,
  buffer: Buffer
): Promise<ImageVariantsMap> {
  const dir = productUploadDir(productId);
  const variants: ImageVariantsMap = {};

  await Promise.all(
    IMAGE_VARIANT_SPECS.map(async (spec) => {
      const body = await processToWebp(buffer, spec.maxSize, spec.cover, spec.quality);
      const filename = variantFilename(imageId, spec.filenameSuffix);
      await writeFile(join(dir, filename), body);
      variants[spec.key] = publicImagePath(productId, filename);
    })
  );

  return variants;
}

export async function deleteVariantFiles(productId: string, imageId: string): Promise<void> {
  const dir = productUploadDir(productId);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return;
  }
  const prefix = `${imageId}`;
  await Promise.all(
    files
      .filter((f) => f === `${prefix}.webp` || f.startsWith(`${prefix}-`))
      .map((f) => unlink(join(dir, f)).catch(() => undefined))
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Busca el mejor archivo fuente en disco para regenerar variantes. */
export async function loadImageSourceBuffer(
  productId: string,
  imageId: string,
  url: string | null,
  thumbUrl: string | null
): Promise<Buffer | null> {
  const dir = productUploadDir(productId);
  const paths: string[] = [
    join(dir, `${imageId}.webp`),
    url ? publicUrlToDiskPath(url) : "",
    join(dir, `${imageId}-thumb.webp`),
    thumbUrl ? publicUrlToDiskPath(thumbUrl) : "",
  ].filter(Boolean);

  for (const p of paths) {
    if (await fileExists(p)) {
      return readFile(p);
    }
  }

  try {
    const files = await readdir(dir);
    const match = files.find((f) => f.startsWith(imageId) && /\.(webp|jpe?g|png|gif)$/i.test(f));
    if (match) {
      return readFile(join(dir, match));
    }
  } catch {
    /* sin carpeta */
  }

  return null;
}

export async function regenerateImageVariants(
  productId: string,
  imageId: string,
  url: string | null,
  thumbUrl: string | null
): Promise<{ variants: ImageVariantsMap; url: string; thumbUrl: string } | null> {
  const source = await loadImageSourceBuffer(productId, imageId, url, thumbUrl);
  if (!source) return null;

  await deleteVariantFiles(productId, imageId);
  const variants = await writeAllVariants(productId, imageId, source);

  const newUrl = variants.lg ?? variants.md ?? "";
  const newThumb = variants.sm ?? variants.xs ?? newUrl;

  return { variants, url: newUrl, thumbUrl: newThumb };
}
