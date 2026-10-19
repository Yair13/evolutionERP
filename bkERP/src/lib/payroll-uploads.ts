import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import multer from "multer";

export const PAYROLL_UPLOADS_ROOT = join(process.cwd(), "uploads", "payroll");

export async function ensurePayrollUploadsDir(): Promise<void> {
  await mkdir(PAYROLL_UPLOADS_ROOT, { recursive: true });
}

export function publicPayrollReceiptPath(filename: string): string {
  return `/uploads/payroll/${encodeURIComponent(filename)}`;
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10MB

export const payrollReceiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("invalid_receipt_file_type"));
    }
  },
});

export async function savePayrollReceiptFile(
  fileBuffer: Buffer,
  originalName: string
): Promise<{ filename: string; publicUrl: string }> {
  await ensurePayrollUploadsDir();
  const ext = extname(originalName).toLowerCase() || ".png";
  const safeBase = originalName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 30);
  const filename = `${Date.now()}-${safeBase}${ext}`;
  const filePath = join(PAYROLL_UPLOADS_ROOT, filename);
  await writeFile(filePath, fileBuffer);
  return {
    filename,
    publicUrl: publicPayrollReceiptPath(filename),
  };
}
