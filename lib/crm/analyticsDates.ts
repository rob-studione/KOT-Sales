/** Presets for „Prarasti klientai“: no invoice since ≥ this many months. */
export const LOST_PRESET_MONTHS = [3, 6, 12, 24] as const;
export type LostPresetMonth = (typeof LOST_PRESET_MONTHS)[number];

export function isLostPresetMonth(n: number): n is LostPresetMonth {
  return (LOST_PRESET_MONTHS as readonly number[]).includes(n);
}

/** Default inactivity window for „Prarasti“ lists and matching „Aktyvūs“ definition on apžvalga. */
export const DEFAULT_LOST_MONTHS: LostPresetMonth = 12;

/** Active list: had at least one invoice on or after this local calendar date. */
export const ACTIVE_WINDOW_MONTHS = 12;

/** YYYY-MM-DD in local calendar: `monthsAgo` months before `ref`. */
export function calendarDateMonthsAgo(months: number, ref = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth() - months, ref.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole days from `isoDate` (YYYY-MM-DD) to `ref` (local midnight comparison). */
export function wholeDaysBetweenIsoDateAndToday(isoDate: string, ref = new Date()): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 0;
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0);
  const start = new Date(`${isoDate}T12:00:00`);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

/** Human-readable inactivity for „Prarasti“ table (compact LT). */
export function formatInactivityDurationLt(days: number): string {
  if (days < 0) return "—";
  if (days === 0) return "0 d.";
  if (days < 45) return `${days} d.`;
  const m = Math.floor(days / 30.44);
  if (m < 24) return `${m} mėn.`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem > 0 ? `${y} met. ${rem} mėn.` : `${y} met.`;
}

export function parseLostMonthsParam(raw: string | string[] | undefined): LostPresetMonth {
  const s = typeof raw === "string" ? raw : "";
  const n = parseInt(s, 10);
  if (isLostPresetMonth(n)) return n;
  return DEFAULT_LOST_MONTHS;
}
