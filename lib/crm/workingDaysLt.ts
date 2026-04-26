/**
 * Lietuvos darbo dienos (be šeštadienio/sekmadienio ir valstybinių / tradicinių švenčių).
 * Datos civilinės YYYY-MM-DD prasmėje sutampa su `vilniusTime` / KPI intervalais.
 */

import { eachDayInclusive, vilniusStartUtc, VILNIUS_TZ } from "@/lib/crm/vilniusTime";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD iš UTC kalendorinės datos (getEasterDate ir pan.). */
function toIsoYmdUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Velykų sekmadienis (Vakarų kalendorius) — Meeus / Jones / Butcher (Anonymous Gregorian).
 */
export function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthNum = Math.floor((h + l - 7 * m + 114) / 31);
  const dayNum = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, monthNum - 1, dayNum));
}

/**
 * Pirmas sekmadienis nurodytame mėnesyje (`month`: 1 = sausis … 12 = gruodis).
 */
export function getFirstSunday(year: number, month: number): Date {
  if (month < 1 || month > 12) throw new Error(`getFirstSunday: invalid month ${month}`);
  for (let day = 1; day <= 31; day++) {
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCMonth() !== month - 1) break;
    if (dt.getUTCDay() === 0) return dt;
  }
  throw new Error(`getFirstSunday: no Sunday in ${year}-${month}`);
}

function isWeekendVilniusYmd(ymd: string): boolean {
  const inst = new Date(vilniusStartUtc(ymd));
  const longWd = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: VILNIUS_TZ }).format(inst);
  return longWd === "Saturday" || longWd === "Sunday";
}

const holidaySetCache = new Map<number, ReadonlySet<string>>();

/**
 * Lietuvos šventinės dienos vieneriems metams (YYYY-MM-DD, unikalios).
 */
export function getLithuanianHolidays(year: number): string[] {
  const cached = holidaySetCache.get(year);
  if (cached) return [...cached].sort();

  const fixed: string[] = [
    `${year}-01-01`,
    `${year}-02-16`,
    `${year}-03-11`,
    `${year}-05-01`,
    `${year}-06-24`,
    `${year}-07-06`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-02`,
    `${year}-12-24`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];

  const easterSun = getEasterDate(year);
  const easterMon = new Date(easterSun.getTime());
  easterMon.setUTCDate(easterMon.getUTCDate() + 1);

  const dynamic: string[] = [
    toIsoYmdUtc(easterSun),
    toIsoYmdUtc(easterMon),
    toIsoYmdUtc(getFirstSunday(year, 5)),
    toIsoYmdUtc(getFirstSunday(year, 6)),
  ];

  const set = new Set<string>([...fixed, ...dynamic]);
  holidaySetCache.set(year, set);
  return [...set].sort();
}

function holidaySetForYear(year: number): ReadonlySet<string> {
  const cached = holidaySetCache.get(year);
  if (cached) return cached;
  getLithuanianHolidays(year);
  return holidaySetCache.get(year)!;
}

/**
 * Ar civilinė diena (Europe/Vilnius) yra darbo diena.
 */
export function isWorkingDayLt(date: Date): boolean {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VILNIUS_TZ }).format(date);
  return isWorkingDayLtYmd(ymd);
}

/** Tas pats kaip `isWorkingDayLt`, bet pagal YYYY-MM-DD (Vilniaus civilinę dieną). */
export function isWorkingDayLtYmd(ymd: string): boolean {
  const year = Number(ymd.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  const holidays = holidaySetForYear(year);
  if (holidays.has(ymd)) return false;
  if (isWeekendVilniusYmd(ymd)) return false;
  return true;
}

/**
 * Darbo dienų skaičius intervale imtinai (pagal Vilniaus kalendorines dienas YYYY-MM-DD).
 */
export function countWorkingDaysLtIso(fromYmd: string, toYmd: string): number {
  if (fromYmd > toYmd) return 0;
  let n = 0;
  for (const d of eachDayInclusive(fromYmd, toYmd)) {
    if (isWorkingDayLtYmd(d)) n += 1;
  }
  return n;
}

/**
 * Darbo dienos tarp dviejų `Date` momentų (civilinė diena imama pagal Europe/Vilnius kiekvienam momentui).
 */
export function countWorkingDaysLt(from: Date, to: Date): number {
  const a = new Intl.DateTimeFormat("en-CA", { timeZone: VILNIUS_TZ }).format(from);
  const b = new Intl.DateTimeFormat("en-CA", { timeZone: VILNIUS_TZ }).format(to);
  return countWorkingDaysLtIso(a, b);
}
