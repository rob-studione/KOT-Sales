/** Kalendorinės datos ir ribų skaičiavimas pagal „Europe/Vilnius“. */

export const VILNIUS_TZ = "Europe/Vilnius";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isIsoDate(yyyyMmDd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd);
}

/** Civilinė diena ±delta (calendar math, nepriklauso nuo DST). */
function addCivilDaysIso(yyyyMmDd: string, deltaDays: number): string {
  if (!isIsoDate(yyyyMmDd)) throw new Error(`addCivilDaysIso: invalid ${yyyyMmDd}`);
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Šiandienos data YYYY-MM-DD pagal Vilnių. */
export function vilniusTodayDateString(ref = new Date()): string {
  return ref.toLocaleDateString("en-CA", { timeZone: VILNIUS_TZ });
}

/** ISO UTC momentas Vilniaus kalendorinės dienos pradžiai (pirmas minutės momentas). */
export function vilniusStartUtc(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`vilniusStartUtc: invalid ${yyyyMmDd}`);
  }
  for (let dh = -1; dh <= 1; dh++) {
    for (let hm = 0; hm < 24 * 60; hm++) {
      const h = Math.floor(hm / 60);
      const min = hm % 60;
      const candidate = new Date(Date.UTC(y, m - 1, d + dh, h, min, 0));
      if (candidate.toLocaleDateString("en-CA", { timeZone: VILNIUS_TZ }) === yyyyMmDd) {
        return candidate.toISOString();
      }
    }
  }
  throw new Error(`vilniusStartUtc: no match for ${yyyyMmDd}`);
}

/** ISO UTC momentas Vilniaus kalendorinės dienos pabaigai (paskutinis minutės momentas). */
export function vilniusEndUtc(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`vilniusEndUtc: invalid ${yyyyMmDd}`);
  }
  let best: Date | null = null;
  for (let dh = -1; dh <= 1; dh++) {
    for (let hm = 0; hm < 24 * 60; hm++) {
      const h = Math.floor(hm / 60);
      const min = hm % 60;
      const candidate = new Date(Date.UTC(y, m - 1, d + dh, h, min, 0));
      if (candidate.toLocaleDateString("en-CA", { timeZone: VILNIUS_TZ }) === yyyyMmDd) {
        if (!best || candidate > best) best = candidate;
      }
    }
  }
  if (!best) throw new Error(`vilniusEndUtc: no match for ${yyyyMmDd}`);
  return best.toISOString();
}

/** Viena civilinė diena atgal pagal Vilnių. */
export function subtractOneCivilDayVilnius(yyyyMmDd: string): string {
  return addCivilDaysIso(yyyyMmDd, -1);
}

/** Pirmadienis (ISO savaitė) — kalendorinės dienos eilutė Vilniuje. */
export function vilniusMondayOfWeekIso(todayIso: string): string {
  let cur = todayIso;
  for (let i = 0; i < 7; i++) {
    const inst = new Date(vilniusStartUtc(cur));
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: VILNIUS_TZ, weekday: "short" }).format(inst);
    if (wd === "Mon") return cur;
    cur = subtractOneCivilDayVilnius(cur);
  }
  return todayIso;
}

/** ISO data (YYYY-MM-DD) pagal Vilnių iš UTC ISO eilutės. */
export function isoDateInVilnius(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString("en-CA", { timeZone: VILNIUS_TZ });
}

/** Mėnesio pirmoji diena (Vilnius), kai šiandien yra `todayIso`. */
export function vilniusFirstDayOfMonthIso(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  return `${y}-${pad2(m)}-01`;
}

/** Kita civilinė diena pirmyn pagal Vilnių. */
export function addOneCivilDayVilnius(yyyyMmDd: string): string {
  return addCivilDaysIso(yyyyMmDd, 1);
}

/** Įtraukiamos dienos nuo `from` iki `to` (įskaitant), YYYY-MM-DD. */
export function eachDayInclusive(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  for (let guard = 0; guard < 400; guard++) {
    out.push(cur);
    if (cur === to) break;
    cur = addOneCivilDayVilnius(cur);
    if (cur > to) break;
  }
  return out;
}
