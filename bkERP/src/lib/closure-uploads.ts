import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import multer from "multer";

export const CLOSURE_UPLOADS_ROOT = join(process.cwd(), "uploads", "closures");

export async function ensureClosureUploadsDir(): Promise<void> {
  await mkdir(CLOSURE_UPLOADS_ROOT, { recursive: true });
}

export function publicClosureReceiptPath(filename: string): string {
  return `/uploads/closures/${encodeURIComponent(filename)}`;
}

const MAX_RECEIPT_BYTES = 25 * 1024 * 1024; // 25MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/jfif",
  "application/pdf",
  "application/octet-stream",
]);

function isAllowedReceiptFile(file: Express.Multer.File): boolean {
  const mime = (file.mimetype || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.has(mime)) return true;
  const ext = extname(file.originalname || "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".jfif", ".pdf"].includes(ext);
}

export const closureReceiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedReceiptFile(file)) {
      cb(null, true);
    } else {
      cb(new Error("invalid_receipt_file_type"));
    }
  },
});

export const closureReceiptsMultiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedReceiptFile(file)) {
      cb(null, true);
    } else {
      cb(new Error("invalid_receipt_file_type"));
    }
  },
});

export async function saveClosureReceiptFile(
  fileBuffer: Buffer,
  originalName: string
): Promise<{ filename: string; publicUrl: string }> {
  await ensureClosureUploadsDir();
  const ext = extname(originalName).toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".jfif", ".pdf"].includes(ext)
    ? ext
    : ".jpg";
  const safeBase = originalName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 30);
  const filename = `${Date.now()}-${safeBase}${safeExt}`;
  const filePath = join(CLOSURE_UPLOADS_ROOT, filename);
  await writeFile(filePath, fileBuffer);
  return {
    filename,
    publicUrl: publicClosureReceiptPath(filename),
  };
}
