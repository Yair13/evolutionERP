import multer from "multer";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 8 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("invalid_image_type"));
  },
});
