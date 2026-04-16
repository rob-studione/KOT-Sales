/** Bendri datos skaičiavimai viešųjų pirkimų UI ir cron (Europe/Vilnius). */

export const VILNIUS_TZ = "Europe/Vilnius";

export function calendarDateInTimeZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return "";
  return `${y}-${m}-${day}`;
}

/** Kalendoriaus dienos nuo `fromIso` iki `toIso` (abi YYYY-MM-DD). */
export function calendarDaysBetweenInclusive(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map((x) => parseInt(x, 10));
  const [y2, m2, d2] = toIso.split("-").map((x) => parseInt(x, 10));
  const t0 = Date.UTC(y1, m1 - 1, d1);
  const t1 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t0) / 86400000);
}

export function vilniusTodayYmd(now: Date = new Date()): string {
  return calendarDateInTimeZone(now, VILNIUS_TZ);
}

/** „liko N d.“ arba pasibaigė; naudoti su valid_until YYYY-MM-DD. */
export function procurementDaysLeftLabel(validUntilYmd: string, now: Date = new Date()): string {
  const vu = validUntilYmd.slice(0, 10);
  const today = vilniusTodayYmd(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vu) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return "—";
  const left = calendarDaysBetweenInclusive(today, vu);
  if (left < 0) return "pasibaigė";
  if (left === 0) return "liko 0 d.";
  return `liko ${left} d.`;
}

/** Kalendorinės dienos iki `valid_until` (šį vakarą = 0; pasibaigus < 0). */
export function procurementCalendarDaysLeft(validUntilYmd: string, now: Date = new Date()): number | null {
  const vu = validUntilYmd.slice(0, 10);
  const today = vilniusTodayYmd(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vu) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  return calendarDaysBetweenInclusive(today, vu);
}

/**
 * Numatytasis „skambinti“ sąrašas: liko dienų (įskaitant vėlavimą) ≤ pranešimo slenksčio.
 * `notifyDaysBefore` — eilutės `notify_days_before` arba projekto numatytasis.
 */
export function isProcurementInDefaultCallWindow(
  validUntilYmd: string,
  notifyDaysBefore: number,
  now: Date = new Date()
): boolean {
  const left = procurementCalendarDaysLeft(validUntilYmd, now);
  if (left === null) return false;
  const n = Math.max(0, Math.floor(Number(notifyDaysBefore) || 0));
  return left <= n;
}
