export const BOGOTA_TIMEZONE = "America/Bogota";

/**
 * Retorna la fecha actual en Colombia en formato YYYY-MM-DD.
 * Garantiza la fecha correcta incluso si el reloj del dispositivo o SO
 * está configurado en UTC u otra zona horaria.
 */
export function getTodayBogotaYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Retorna el primer día del mes actual en Colombia en formato YYYY-MM-01.
 */
export function getFirstDayOfMonthBogotaYmd(): string {
  const ymd = getTodayBogotaYmd();
  return `${ymd.slice(0, 7)}-01`;
}

/**
 * Retorna la fecha de ayer en Colombia en formato YYYY-MM-DD.
 */
export function getYesterdayBogotaYmd(): string {
  return getDaysAgoBogotaYmd(1);
}

/**
 * Retorna la fecha de hace N días en Colombia en formato YYYY-MM-DD.
 */
export function getDaysAgoBogotaYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Normaliza un string de fecha/timestamp a un objeto Date seguro.
 * Si recibe 'YYYY-MM-DD', se asegura de que no sufra desajuste horario UTC.
 */
function parseIsoToDate(iso: string): Date {
  // Si es estrictamente 'YYYY-MM-DD'
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    const [y, m, d] = iso.trim().split("-").map(Number);
    // Crear fecha a mediodía local de Colombia para evitar desplazamientos por medianoche
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  // Si es un string de postgres con espacio "2026-10-19 19:43:00+00" o "2026-10-19 19:43:00"
  let sanitized = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(sanitized)) {
    sanitized = sanitized.replace(" ", "T");
  }
  return new Date(sanitized);
}

/**
 * Formatea una fecha en hora de Colombia (ej: '19 oct 2026' o '19/10/2026').
 */
export function formatBogotaDate(
  iso: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!iso) return "—";
  try {
    const d = parseIsoToDate(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: BOGOTA_TIMEZONE,
      year: "numeric",
      month: "short",
      day: "numeric",
      ...options,
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Formatea una fecha y hora completa en hora de Colombia (ej: '19 oct 2026, 7:43 p. m.').
 */
export function formatBogotaDateTime(
  iso: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!iso) return "—";
  try {
    const d = parseIsoToDate(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: BOGOTA_TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short",
      ...options,
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Formatea fecha y hora en estilo numérico corto (ej: '19/10/2026, 7:43 p. m.').
 */
export function formatBogotaDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = parseIsoToDate(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: BOGOTA_TIMEZONE,
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Retorna solo la hora en hora de Colombia (ej: '7:43 p. m.').
 */
export function formatBogotaTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = parseIsoToDate(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: BOGOTA_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Convierte un ISO/timestamp a 'YYYY-MM-DD' en la zona horaria de Colombia.
 */
export function toBogotaYmd(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  try {
    const d = typeof iso === "string" ? parseIsoToDate(iso) : iso;
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BOGOTA_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Comprueba si una fecha/timestamp corresponde al día de hoy en Colombia.
 */
export function isTodayBogota(iso: string | Date | null | undefined): boolean {
  if (!iso) return false;
  return toBogotaYmd(iso) === getTodayBogotaYmd();
}
