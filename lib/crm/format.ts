import { isSyntheticCompanyCode } from "@/lib/crm/company-code";

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatMoney(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Kalendoriaus patikra (be laiko juostos klaidų); naudoja UTC komponentus. */
function isValidCalendarDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > 2200) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** Pašalina tarpus — leidžia įvesti „6 . 4 . 2026“. */
function normalizeLtDateInput(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/** Šiandienos data vietiniu laiku kaip YYYY-MM-DD (formų numatytoms reikšmėms). */
export function todayLocalIsoDate(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Datos įvedimo laukas CRM veiksmų formose (ISO; sutampa su parseDateInputToIso). */
export const CRM_DATE_INPUT_PLACEHOLDER = "YYYY-MM-DD";

/** ISO kalendorinė data iš dalių (UI rodymas). */
export function formatIsoDateFromParts(day: number, month: number, year: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Kalendorinė data UI: **YYYY-MM-DD** (ISO date only).
 * `YYYY-MM-DD` eilutės grąžinamos normalizuotai; su laiku — vietinė kalendorinė data.
 */
export function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "—";
    return formatIsoDateFromParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "—";
    return formatIsoDateFromParts(dt.getDate(), dt.getMonth() + 1, dt.getFullYear());
  }
  if (typeof value !== "string") return "—";
  const t = value.trim();
  if (!t) return "—";

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split("-");
    return `${y}-${m}-${d}`;
  }

  const dt = new Date(t);
  if (Number.isNaN(dt.getTime())) return "—";
  return formatIsoDateFromParts(dt.getDate(), dt.getMonth() + 1, dt.getFullYear());
}

/** @deprecated Naudokite formatIsoDateFromParts */
export const formatLtDateDisplayFromParts = formatIsoDateFromParts;

/** Numatytoji šios dienos data YYYY-MM-DD įvedimo laukui (CRM veiksmų formos). */
export function crmDateInputDefaultToday(): string {
  return todayLocalIsoDate();
}

/**
 * Data + laikas UI: **YYYY-MM-DD HH:mm** (24 h, vietinis laikas).
 */
export function formatDateTimeLt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const d =
    value instanceof Date
      ? value
      : typeof value === "number" && Number.isFinite(value)
        ? new Date(value)
        : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = formatIsoDateFromParts(d.getDate(), d.getMonth() + 1, d.getFullYear());
  const timePart = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${datePart} ${timePart}`;
}

/**
 * Trumpa ašies etiketė (grafikai): **MM-DD** iš `YYYY-MM-DD`.
 */
export function formatIsoMonthDay(isoYyyyMmDd: string): string {
  const s = String(isoYyyyMmDd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [, m, d] = s.split("-");
  return `${m}-${d}`;
}

/** @deprecated Naudokite formatIsoMonthDay */
export const formatLtDateDayMonth = formatIsoMonthDay;

/**
 * Formos laukas → YYYY-MM-DD (Postgres `date`).
 * Priima:
 * - `YYYY-MM-DD` (standartinis)
 * - `YYYY-M-D` (lanksčiai, su kalendoriaus tikrinimu)
 * - `D.M.YYYY` … `DD.MM.YYYY` (įvestis iš senesnių formų)
 * Prieš analizę pašalinami tarpai (įskaitant „6 . 4 . 2026“).
 */
export function parseDateInputToIso(raw: unknown): string | null {
  if (raw == null) return null;
  const s = normalizeLtDateInput(String(raw));
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [ys, ms, ds] = s.split("-");
    const year = Number(ys);
    const month = Number(ms);
    const day = Number(ds);
    if (!isValidCalendarDateParts(year, month, day)) return null;
    return s;
  }

  const isoLoose = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoLoose) {
    const year = Number(isoLoose[1]);
    const month = Number(isoLoose[2]);
    const day = Number(isoLoose[3]);
    if (!isValidCalendarDateParts(year, month, day)) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const dot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (dot) {
    const day = Number(dot[1]);
    const month = Number(dot[2]);
    const year = Number(dot[3]);
    if (!isValidCalendarDateParts(year, month, day)) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

/** Display name from latest invoice client snapshot; company_name stays visible when code is missing. */
export function displayClientName(
  company_name: string | null | undefined,
  company_code: string | null | undefined
): string {
  const name = (company_name ?? "").trim();
  const cc = (company_code ?? "").trim();
  if (name && name.toUpperCase() !== "UNKNOWN") return name;
  if (isSyntheticCompanyCode(cc)) return "—";
  const numericOnly = /^\d+$/.test(cc);
  if (!numericOnly && cc && cc.toUpperCase() !== "UNKNOWN") return cc;
  return "—";
}

/** Clients / invoices lists — missing code. */
export function formatCompanyCodeList(company_code: string | null | undefined): string {
  const c = (company_code ?? "").trim();
  if (!c || c.toUpperCase() === "UNKNOWN" || isSyntheticCompanyCode(c)) return "—";
  return c;
}

/** Detail view — missing code. */
export function formatCompanyCodeDetail(company_code: string | null | undefined): string {
  const c = (company_code ?? "").trim();
  if (!c || c.toUpperCase() === "UNKNOWN" || isSyntheticCompanyCode(c)) return "—";
  return c;
}
