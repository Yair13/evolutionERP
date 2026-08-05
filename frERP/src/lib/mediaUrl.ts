const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type ImageVariant = "xs" | "sm" | "md" | "lg";

/** Convierte rutas /uploads/... del API en URL absoluta para <img>. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

const VARIANT_FALLBACK: Record<ImageVariant, ImageVariant[]> = {
  xs: ["xs", "sm", "md", "lg"],
  sm: ["sm", "md", "xs", "lg"],
  md: ["md", "sm", "lg", "xs"],
  lg: ["lg", "md", "sm"],
};

/** Elige la variante generada en el servidor (o url/thumb legacy). */
export function resolveProductImage(opts: {
  url?: string | null;
  thumbUrl?: string | null;
  variants?: Partial<Record<ImageVariant, string>> | null;
  prefer?: ImageVariant;
}): string | null {
  const { url, thumbUrl, variants, prefer = "md" } = opts;
  for (const key of VARIANT_FALLBACK[prefer]) {
    const path = variants?.[key];
    if (path) return resolveMediaUrl(path);
  }
  if (prefer === "lg" || prefer === "md") {
    const fromUrl = resolveMediaUrl(url);
    if (fromUrl) return fromUrl;
  }
  const fromThumb = resolveMediaUrl(thumbUrl);
  if (fromThumb) return fromThumb;
  return resolveMediaUrl(url);
}

/**
 * Reescribe una URL de variante a una más chica (xs/sm) cuando el path sigue el patrón del servidor.
 * Reduce consumo de datos en POS/tablets con internet intermitente.
 */
export function resolveLightMediaUrl(
  url: string | null | undefined,
  prefer: "xs" | "sm" = "sm"
): string | null {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return null;
  if (prefer === "xs") {
    return resolved
      .replace(/-md(\.[a-z0-9]+)$/i, "-xs$1")
      .replace(/-thumb(\.[a-z0-9]+)$/i, "-xs$1");
  }
  return resolved
    .replace(/-md(\.[a-z0-9]+)$/i, "-thumb$1")
    .replace(/-xs(\.[a-z0-9]+)$/i, "-thumb$1");
}
