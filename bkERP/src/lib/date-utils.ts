export const BOGOTA_TIMEZONE = "America/Bogota";

/**
 * Retorna la fecha actual en Colombia en formato YYYY-MM-DD.
 * Independiente de la zona horaria del servidor o entorno.
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
 * Suma o resta días a una fecha 'YYYY-MM-DD' de manera segura sin desajuste de zona horaria.
 */
export function addDaysYmd(ymd: string, days: number): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd.trim())) return ymd;
  const [y, m, d] = ymd.trim().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

/**
 * Retorna una lista de fechas 'MM-DD' para los últimos N días en Colombia.
 */
export function getLastNDatesBogota(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BOGOTA_TIMEZONE,
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    dates.push(`${m}-${day}`);
  }
  return dates;
}
