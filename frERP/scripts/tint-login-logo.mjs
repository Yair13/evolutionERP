/**
 * Rebuild login logo from a flat white-background PNG:
 * 1) near-white → transparent (soft matte)
 * 2) resize to max width 720px
 * 3) push light, low-saturation interior (globe "paper") toward pure white
 *
 * Place source at: public/logo-source-white.png
 * Output: public/logo-evolution-login.png
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "public", "logo-source-white.png");
const outputPath = path.join(root, "public", "logo-evolution-login.png");

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White / light backdrop → alpha */
function applyWhiteMatte(data, width, height) {
  const whiteHigh = 252;
  const whiteLow = 210;
  const range = whiteHigh - whiteLow;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const b = data[i];
      const g = data[i + 1];
      const r = data[i + 2];
      const minC = Math.min(r, g, b);
      let alpha = 255;
      if (minC >= whiteHigh) alpha = 0;
      else if (minC <= whiteLow) alpha = 255;
      else alpha = Math.round((255 * (whiteHigh - minC)) / range);
      data[i + 3] = alpha;
    }
  }
}

/** Lighten globe interior toward white; keep dark continents + bright blue swoosh */
function whitenGlobeInterior(data, width, height) {
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const b0 = data[i];
      const g0 = data[i + 1];
      const r0 = data[i + 2];
      const a = data[i + 3];
      if (a < 25) continue;

      const minC = Math.min(r0, g0, b0);
      const maxC = Math.max(r0, g0, b0);
      const sat = maxC - minC;
      const lum = luminance(r0, g0, b0);

      // Dark landmass / navy text
      if (lum < 92) continue;

      // Bright saturated orbital swoosh (keep blues)
      if (b0 > r0 + 32 && b0 > 175 && sat > 38) continue;

      // Already very bright (skip micro-tweaks)
      if (minC > 248) continue;

      // "Paper" inside globe: mid-light, not too saturated
      if (lum > 105 && sat < 88) {
        const lumW = Math.min(1, Math.max(0, (lum - 105) / 130));
        const satW = Math.min(1, Math.max(0.25, (88 - sat) / 88));
        const wgt = Math.min(1, lumW * satW * 0.92);
        data[i] = Math.round(b0 + (255 - b0) * wgt);
        data[i + 1] = Math.round(g0 + (255 - g0) * wgt);
        data[i + 2] = Math.round(r0 + (255 - r0) * wgt);
        changed++;
      }
    }
  }
  return changed;
}

await fs.access(sourcePath);

const rawIn = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let { data, info } = rawIn;
let { width, height } = info;
if (info.channels !== 4) throw new Error("Expected RGBA");

applyWhiteMatte(data, width, height);

const maxW = 720;
if (width > maxW) {
  const resized = await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .resize(maxW, null, { kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  data = resized.data;
  width = resized.info.width;
  height = resized.info.height;
}

const n = whitenGlobeInterior(data, width, height);

await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outputPath);

console.log(`rebuild-login-logo: ${width}x${height}, interior pixels lightened: ${n} → ${outputPath}`);
