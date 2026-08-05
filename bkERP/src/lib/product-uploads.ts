import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const UPLOADS_ROOT = join(process.cwd(), "uploads");

export async function ensureUploadsDir(): Promise<void> {
  await mkdir(join(UPLOADS_ROOT, "products"), { recursive: true });
}

export function productUploadDir(productId: string): string {
  return join(UPLOADS_ROOT, "products", productId);
}

/** Ruta pública servida por express.static */
export function publicImagePath(productId: string, filename: string): string {
  return `/uploads/products/${productId}/${filename}`;
}
